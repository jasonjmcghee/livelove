import * as path from 'path';
import { 
    ExtensionContext, 
    window, 
    Range, 
    TextEditor, 
    Selection,
    workspace,
    commands,
} from 'vscode';
import {
    LanguageClient,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';
import { ColorPickerPanel } from './colorslider';
import { TreeSitterHighlighter } from './highlighter';
import { SliderPanel } from './numberslider';

let client: LanguageClient;

interface TokenInfo {
    text: string;
    tokenType: string;
    modifiers?: string[];
}

interface LineInfo {
    lineNumber: number;
    text: string;
    tokens: TokenInfo[];
    isCurrent: boolean;
    isSelected: boolean;
}

interface ViewerState {
    uri: string;
    visibleLines: LineInfo[];
    currentLine: number;
    selection: {
        startLine: number;
        startChar: number;
        endLine: number;
        endChar: number;
    };
    language: string;
}

let viewerEnabled = false;
let windowSize = 5;
let lastState: string | null = null;
let lastViewedEditor: TextEditor | null = null;
let lastChangedEditor: TextEditor | null = null;

const highlighter = new TreeSitterHighlighter();

export async function activate(context: ExtensionContext) {
    const serverModule = context.asAbsolutePath(path.join('out', 'server.js'));
    
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc }
    };

    client = new LanguageClient(
        'livelove-lsp',
        serverOptions,
        {
            documentSelector: [{ scheme: 'file', language: 'lua' }]
        }
    );

    let currentSelection: { text: string, range: Range } | null = null;
    let isTyping = false;

    function clearPanels() {
        const sp = SliderPanel.currentPanel;
        if (sp && !sp.panel?.visible) {
            sp.panel?.dispose();
        }
        const cp = ColorPickerPanel.currentPanel;
        if (cp && !cp.panel?.visible) {
            cp.panel?.dispose();
        }

        currentSelection = null;
    }

    context.subscriptions.push(
        workspace.onDidChangeTextDocument(event => {
            // if (viewerEnabled) {
                highlighter.clearCache(event.document);
                updateContent();
            // }

            client.sendNotification("livelove/fileUpdated", {
                uri: event.document.uri.path, 
                text: event.document.getText()
            });

            if (event.contentChanges.length > 0) {
                isTyping = true;
                // Reset the typing flag after a short delay
                setTimeout(() => {
                    isTyping = false;
                }, 100);
            }
        })
    );

    context.subscriptions.push(
        window.onDidChangeActiveTextEditor(() => {
            updateContent();
        }),
        window.onDidChangeTextEditorSelection(event => {
            if (window.activeTextEditor) {
                lastViewedEditor = window.activeTextEditor;
                updateContent();
            }

            const editor = event.textEditor;
            const selection = editor.selection;
            
            // Don't show panels if we're typing
            if (isTyping) {
                clearPanels();
                return;
            }

            const isMoreThanOneCharacter = (currentSelection?.text?.length ?? 0) > 0;

            // Only handle clicks (when selection doesn't change)
            if (event.selections.length === 1 && 
                currentSelection &&
                isMoreThanOneCharacter &&
                event.selections[0].isEmpty) {
                if (currentSelection.range.contains(event.selections[0].active)) {
                    const editor = event.textEditor;
                    
                    // Restore the selection
                    editor.selection = new Selection(
                        currentSelection.range.start,
                        currentSelection.range.end
                    );
                    
                    // Check if it's a number or color
                    if (/^-?\d*\.?\d+$/.test(currentSelection.text)) {
                        const value = parseFloat(currentSelection.text);
                        SliderPanel.createOrShow(currentSelection.range, editor, value);
                    } else if (/^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})\b$/i.test(currentSelection.text)) {
                        ColorPickerPanel.createOrShow(currentSelection.range, editor, currentSelection.text);
                    }
                } else {
                    clearPanels();
                }
                return;
            }

            if (!selection.isEmpty) {
                clearPanels();

                const text = editor.document.getText(selection).trim();
                // Check if it's a number or color
                if (/^-?\d*\.?\d+$/.test(text) || /^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})\b$/i.test(text)) {
                    currentSelection = { text, range: selection };
                } else {
                    currentSelection = null;
                }
                return;
            }
        }),
    );

    const updateContent = async () => {
        // if (!viewerEnabled) return;
        const editor = window.activeTextEditor ?? lastViewedEditor;
        if (!editor) {
            console.log(JSON.stringify({ error: 'No active editor' }));
            return;
        }
        lastViewedEditor = editor;

        const document = editor.document;
        const selection = editor.selection;
        const currentLine = selection.active.line;

        // Calculate the visible range (5 lines above and below)
        const startLine = Math.max(0, currentLine - windowSize);
        const endLine = Math.min(document.lineCount - 1, currentLine + windowSize);

        const state: ViewerState = {
            uri: document.uri.toString(),
            visibleLines: [],
            currentLine: currentLine,
            selection: {
                startLine: selection.start.line,
                startChar: selection.start.character,
                endLine: selection.end.line,
                endChar: selection.end.character
            },
            language: document.languageId
        };

        // Process each visible line and its tokens
        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i);
            const tokens = await highlighter.getLineTokens(document, line);
            
            state.visibleLines.push({
                lineNumber: i,
                text: line.text,
                tokens: tokens,
                isCurrent: i === currentLine,
                isSelected: i >= selection.start.line && i <= selection.end.line
            });
        }

        // Only send update if state has changed
        if (JSON.stringify(state) !== lastState) {
            lastState = JSON.stringify(state);
            client.sendNotification('livelove/viewerState', state);
        }
    };

    client.onNotification("livelove/viewerWindow", (params) => {
        viewerEnabled = params.enabled;
        windowSize = params.windowSize;
    
        // if (viewerEnabled) {
            updateContent();
        // }
    });

    client.onNotification("livelove/editorCommand", async ({ command }) => {
        const editor = window.activeTextEditor ?? lastViewedEditor;
        if (!editor) {
            console.log(JSON.stringify({ error: 'No active editor' }));
            return;
        }

        await window.showTextDocument(editor.document, {
            viewColumn: editor.viewColumn,
            preserveFocus: false // This ensures the editor gets focus
        });
        await commands.executeCommand(command);
    });

    client.onNotification("livelove/replaceSelection", ({ text }) => {
        const editor = window.activeTextEditor ?? lastViewedEditor;
        if (!editor) {
            console.log(JSON.stringify({ error: 'No active editor' }));
            return;
        }
        const selections = editor.selections;
    
        editor.edit(editBuilder => {
            selections.forEach(selection => {
                // If there's no selection, insert at cursor position
                if (selection.isEmpty) {
                    editBuilder.insert(selection.active, text);
                } else {
                    // Replace the selected text
                    editBuilder.replace(selection, text);
                }
            });
        });
    });

    try {
        await client.start();
    } catch (error) {
        console.error('Failed to start language client:', error);
    }
}

export function deactivate(): Thenable<void> | undefined {
    return client?.stop();
}