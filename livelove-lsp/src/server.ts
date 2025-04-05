import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    InlayHint,
} from 'vscode-languageserver/node';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import * as net from 'net';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

interface EditorViewport {
    selection: {
        start: { line: number, character: number },
        end: { line: number, character: number }
    };
    visibleLines: {
        line: number;
        text: string;
        tokens: Array<{
            text: string;
            tokenType: string;
            startChar: number;
            endChar: number;
        }>;
    }[];
    currentLine: number;
}

const makeVariableRegex = (varName: string) => new RegExp(`\\b${varName}\\b`, 'g');
const regexCache = new Map<string, RegExp>();

// Cache for document analysis
type DocumentCache = {
    positions: Map<string, Position[]>;
    text: string;  // Cache the document text to avoid getText() calls
    dirty: boolean; // Track if cache needs updating
};

const documentCaches = new Map<string, DocumentCache>();
let documentCurrentValues: Map<string, Map<string, string>> = new Map();
let loveClients: net.Socket[] = [];
let sendRefreshTimeout: NodeJS.Timeout | undefined;
let sendRefreshAllTimeout: NodeJS.Timeout | undefined;
let sendAssetRefreshTimeout: NodeJS.Timeout | undefined;
const FILE_UPDATE_DEBOUNCE_TIME = 10;

function sendClientFileUpdate(doc: TextDocument) {
    if (sendRefreshTimeout) {
        clearTimeout(sendRefreshTimeout);
    }
    sendRefreshTimeout = setTimeout(() => {
        const message = `\nFILE_UPDATE:${doc.uri}\n${doc.getText()}\n---END---\n`;
        loveClients.forEach(client => client.write(message));
    }, FILE_UPDATE_DEBOUNCE_TIME);
}

function sendClientAllFilesUpdate() {
    if (sendRefreshAllTimeout) {
        clearTimeout(sendRefreshAllTimeout);
    }
    sendRefreshAllTimeout = setTimeout(() => {
        documents.all().forEach((doc) => {
            const message = `\nFILE_UPDATE:${doc.uri}\n${doc.getText()}\n---END---\n`;
            loveClients.forEach(client => client.write(message));
        });
    }, FILE_UPDATE_DEBOUNCE_TIME);
}

function sendClientAssetFileUpdate({uri, text}: {uri: string, text: string}) {
    if (sendAssetRefreshTimeout) {
        clearTimeout(sendAssetRefreshTimeout);
    }
    sendAssetRefreshTimeout = setTimeout(() => {
        const message = `\nASSET_FILE_UPDATE:${uri}\n${text}\n---END---\n`;
        loveClients.forEach(client => client.write(message));
    }, FILE_UPDATE_DEBOUNCE_TIME);
}

function analyzeMultipleVariablePositions(text: string, varNames: string[], doc: TextDocument): Map<string, Position[]> {
    const allPositions = new Map<string, Position[]>();
    
    // Create regexes for all variables at once
    const regexes = new Map<string, RegExp>();
    for (const varName of varNames) {
        let regex = regexCache.get(varName);
        if (!regex) {
            regex = makeVariableRegex(varName);
            regexCache.set(varName, regex);
        }
        regexes.set(varName, regex);
    }
    
    // Single pass through the text for all variables
    for (const [varName, regex] of regexes) {
        const positions: Position[] = [];
        regex.lastIndex = 0; // Reset regex state
        let match;
        while ((match = regex.exec(text)) !== null) {
            positions.push(doc.positionAt(match.index + varName.length));
        }
        if (positions.length > 0) {
            allPositions.set(varName, positions);
        }
    }
    
    return allPositions;
}

// Batch cache updates
function updateCacheForVariables(doc: TextDocument, varNames: string[], force = false, remove = false) {
    const cache = documentCaches.get(doc.uri);
    if (!cache || (!cache.dirty && !force)) return;

    if (remove) {
        // Batch removal
        for (const varName of varNames) {
            cache.positions.delete(varName);
        }
    } else {
        // Batch analysis
        const newPositions = analyzeMultipleVariablePositions(cache.text, varNames, doc);
        
        // Batch update cache
        for (const varName of varNames) {
            const positions = newPositions.get(varName);
            if (positions) {
                cache.positions.set(varName, positions);
            } else {
                cache.positions.delete(varName);
            }
        }
    }
}

// Helper function for single variable cache update (for backward compatibility)
function updateCacheForVariable(doc: TextDocument, varName: string, force = false, remove = false) {
    updateCacheForVariables(doc, [varName], force, remove);
}

let initialized = false;

function refreshInlayHints(uri?: string) {
    if (initialized) {
        connection.languages.inlayHint.refresh();
    }
}

// Initialize with performance-focused capabilities
connection.onInitialize((params: InitializeParams): InitializeResult => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            inlayHintProvider: true,
        }
    };
});

connection.onInitialized(() => {
    initialized = true;
    connection.onRequest('textDocument/inlayHint', (params) => {
        const uri = params.textDocument.uri;
        const cache = documentCaches.get(uri);
        if (!cache) return [];

        const currentValues = documentCurrentValues.get(uri);
        if (!currentValues) return [];

        const hints: InlayHint[] = [];
        
        for (const [varName, positions] of cache.positions) {
            if (!currentValues.has(varName)) { return; }
            const value = currentValues.get(varName);

            hints.push(...positions.map(pos => ({
                position: pos,
                label: `${value}`,
                // position: { ...pos, character: Number.MAX_VALUE },
                // label: `${varName} = ${value}`,
                paddingLeft: true
            })));
        }

        return hints;
    });
});

documents.onDidOpen((params) => {
    const doc = params.document;
    
    // Update cache
    const cache =  documentCaches.get(doc.uri) || {
        positions: new Map(),
        text: doc.getText(),
        dirty: true
    };

    cache.dirty = true;
    documentCaches.set(doc.uri, cache);

    if (!documentCurrentValues.has(doc.uri)) {
        documentCurrentValues.set(doc.uri, new Map());
    }
    const currentValues = documentCurrentValues.get(doc.uri) ?? new Map();

    updateCacheForVariables(doc, Array.from(currentValues.keys()));

    // Notify LÖVE clients
    sendClientFileUpdate(doc);

    cache.dirty = false;
    refreshInlayHints(doc.uri);
});

documents.onDidChangeContent((params) => {
    const doc = params.document;
    const text = doc.getText();
    
    // Update cache
    const cache = documentCaches.get(doc.uri) || {
        positions: new Map(),
        text: '',
        dirty: true
    };
    
    cache.text = text;
    cache.dirty = true;
    documentCaches.set(doc.uri, cache);
    if (!documentCurrentValues.has(doc.uri)) {
        documentCurrentValues.set(doc.uri, new Map());
    }
    const currentValues = documentCurrentValues.get(doc.uri) ?? new Map();

    updateCacheForVariables(doc, Array.from(currentValues.keys()));

    cache.dirty = false;

    // Notify LÖVE clients
    sendClientFileUpdate(doc);

    // Trigger refresh
    refreshInlayHints(doc.uri);
});

connection.onNotification('livelove/viewerState', (state) => {
    if (loveClients.length === 0) return;
    
    const message = `\nVIEWER_STATE\n${JSON.stringify(state)}\n---END---\n`;
    loveClients.forEach(client => client.write(message));
});

connection.onNotification('livelove/fileUpdated', ({uri, text}: {uri: string, text: string}) => {
    if (loveClients.length === 0) return;
    
    sendClientAssetFileUpdate({uri, text});
});

function startLoveServer() {
    const server = net.createServer();
    try {
        server.listen(12345, '127.0.0.1', () => {
            connection.console.info('LÖVE server listening on port 12345');
        });
    } catch (err) {
        connection.console.error(`Failed to start TCP server: ${err}`);
    }

    server.on('connection', (socket) => {
        loveClients.push(socket);

        // Notify LÖVE clients
        sendClientAllFilesUpdate();

        let buffer = '';
        socket.on('data', (data) => {
            buffer += data.toString();
            
            let endIndex;
            while ((endIndex = buffer.indexOf('\n---END---\n')) !== -1) {
                const message = buffer.substring(0, endIndex).trim();
                // console.info(`Message: ${message}`);
                buffer = buffer.substring(endIndex + 10);

                if (message.startsWith("VARS_UPDATE")) {
                    const [_, varData] = message.split('\n');
                    const payload = (JSON.parse(varData) as { updates: { variables: Record<string, string>; }[], uri: string });

                    const { uri, updates } = payload;

                    const doc = documents.all().find((doc) => doc.uri === uri);
                    if (doc) {
                        if (!documentCurrentValues.has(doc.uri)) {
                            documentCurrentValues.set(doc.uri, new Map());
                        }
                        const currentValues = documentCurrentValues.get(doc.uri) ?? new Map();

                        // connection.console.info(`Updates for ${doc.uri}`);
                        const allVars = new Set<string>();
                        updates.forEach(({ variables }) => {
                            Object.entries(variables).forEach(([name, value]) => {
                                currentValues.set(name, value);
                                allVars.add(name);
                            });
                        });
                        updateCacheForVariables(doc, Array.from(allVars), true);
                        refreshInlayHints();
                    }
                }

                if (message.startsWith("VIEWER_WINDOW")) {
                    const [_, varData] = message.split('\n');
                    const { enabled, window_size } = JSON.parse(varData) as { enabled: boolean, window_size?: number };
                    connection.sendNotification("livelove/viewerWindow", {
                        enabled,
                        windowSize: window_size ?? 5
                    });
                    connection.console.info(`Viewer ${enabled ? "enabled" : "disabled"}`);
                }

                if (message.startsWith("REPLACE_SELECTION")) {
                    const [_, varData] = message.split('\n');
                    connection.sendNotification("livelove/replaceSelection", {
                        text: varData
                    });
                    connection.console.info(`Replaced selection with: ${varData}`);
                }

                if (message.startsWith("EDITOR_COMMAND")) {
                    const [_, varData] = message.split('\n');
                    const { command } = JSON.parse(varData) as { command: string };
                    connection.sendNotification("livelove/editorCommand", { command });
                    connection.console.info(`Sent editor command: ${command}`);
                }
            }

        });

        socket.on('close', () => {
            loveClients = loveClients.filter(client => client !== socket);
        });
    });
}

// Start everything up
documents.listen(connection);
connection.listen();
startLoveServer();