import { Position, Range, Selection, TextEditor, ViewColumn, WebviewPanel, window } from "vscode";

export class ColorPickerPanel {
    static currentPanel: ColorPickerPanel | undefined;
    panel: WebviewPanel | null = null;
    private readonly editor: TextEditor;
    currentRange: Range;
    private originalFormat: {
        isUpperCase: boolean;
        hasAlpha: boolean;
    };
    private undoDisabled = false;

    private constructor(range: Range, editor: TextEditor, initialColor: string) {
        this.editor = editor;
        this.currentRange = range;
        this.originalFormat = {
            isUpperCase: initialColor === initialColor.toUpperCase(),
            hasAlpha: initialColor.length === 9
        };
        this.initializePanel(initialColor);
    }

    private initializePanel(initialColor: string) {
        this.panel = window.createWebviewPanel(
            'colorPicker',
            'Color Picker',
            ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getWebviewContent(initialColor);

        this.panel.webview.onDidReceiveMessage(
            message => {
                if (message.command === 'colorChanged') {
                    if (!this.undoDisabled) {
                        this.undoDisabled = true;
                        this.editor.edit(builder => { }, {
                            undoStopBefore: true,
                            undoStopAfter: false
                        });
                    }
                    this.updateEditorValue(message.color);
                }
                if (message.command === 'colorChangeComplete') {
                    if (this.undoDisabled) {
                        this.editor.edit(builder => {
                            builder.replace(this.currentRange, message.color);
                        }, {
                            undoStopBefore: false,
                            undoStopAfter: true
                        });
                        this.undoDisabled = false;
                    }
                }
            },
            undefined
        );

        this.panel.onDidDispose(() => {
            // Create final undo stop when panel is closed
            if (this.undoDisabled) {
                this.editor.edit(builder => { }, {
                    undoStopBefore: false,
                    undoStopAfter: true
                });
                this.undoDisabled = false;
            }
            ColorPickerPanel.currentPanel = undefined;
        });
    }

    private updateEditorValue(newColor: string) {
        this.editor.edit(builder => {
            builder.replace(this.currentRange, newColor);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        }).then(() => {
            const startPos = this.currentRange.start;
            const endPos = new Position(startPos.line, startPos.character + newColor.length);
            this.currentRange = new Range(startPos, endPos);
            this.editor.selection = new Selection(startPos, endPos);
        });
    }

    private getWebviewContent(initialColor: string) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        padding: 16px;
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                        font-family: var(--vscode-font-family);
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .color-row {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    input[type="color"] {
                        -webkit-appearance: none;
                        width: 64px;
                        height: 32px;
                        border: none;
                        padding: 0;
                        background: transparent;
                    }
                    input[type="color"]::-webkit-color-swatch-wrapper {
                        padding: 0;
                        background: repeating-conic-gradient(#808080 0% 25%, #fff 0% 50%) 50% / 8px 8px;
                    }
                    input[type="color"]::-webkit-color-swatch {
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                    }
                    input[type="text"] {
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 4px 8px;
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                    }
                    .alpha-row {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    input[type="range"] {
                        flex: 1;
                        height: 2px;
                        -webkit-appearance: none;
                        background: var(--vscode-scrollbarSlider-background);
                    }
                    input[type="range"]::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        height: 12px;
                        width: 12px;
                        border-radius: 50%;
                        background: var(--vscode-button-background);
                        cursor: pointer;
                    }
                    .alpha-label {
                        min-width: 40px;
                        text-align: right;
                        font-size: 12px;
                        color: var(--vscode-foreground);
                    }
                </style>
            </head>
            <body>
                <div class="color-row">
                    <input type="color" id="colorPicker" value="${initialColor}">
                    <input type="text" id="hexInput" value="${initialColor}">
                </div>
                <div class="alpha-row">
                    <input type="range" id="alphaSlider" min="0" max="255" value="255">
                    <span class="alpha-label" id="alphaLabel">100%</span>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const colorPicker = document.getElementById('colorPicker');
                    const hexInput = document.getElementById('hexInput');
                    const alphaSlider = document.getElementById('alphaSlider');
                    const alphaLabel = document.getElementById('alphaLabel');

                    function parseColor(color) {
                        let hex = color.substring(1);
                        let alpha = 255;
                        
                        if (hex.length === 8) {
                            alpha = parseInt(hex.slice(6, 8), 16);
                            hex = hex.slice(0, 6);
                        } else if (hex.length === 4) {
                            alpha = parseInt(hex.slice(3, 4).repeat(2), 16);
                            hex = hex.slice(0, 3);
                        } else if (hex.length === 3) {
                            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
                        }
                        
                        return { hex: '#' + hex, alpha };
                    }

                    function updateAlphaLabel(alpha) {
                        const percentage = Math.round((alpha / 255) * 100);
                        alphaLabel.textContent = percentage + '%';
                    }

                    function combineColorAndAlpha(baseColor, alpha) {
                        const { hex } = parseColor(baseColor);
                        const alphaHex = alpha.toString(16).padStart(2, '0');
                        return hex + alphaHex;
                    }

                    function updateAllControls(color) {
                        const { hex, alpha } = parseColor(color);
                        colorPicker.value = hex;
                        hexInput.value = color;
                        alphaSlider.value = alpha;
                        updateAlphaLabel(alpha);
                        
                        // Update color swatch transparency
                        const rgba = hex2rgba(hex, alpha / 255);
                        colorPicker.style.opacity = alpha / 255;
                    }

                    function hex2rgba(hex, alpha = 1) {
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        return \`rgba(\${r}, \${g}, \${b}, \${alpha})\`;
                    }

                    function isValidHex(color) {
                        return /^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(color);
                    }

                    // Format settings passed directly from the extension
                    const formatSettings = {
                        isUpperCase: ${this.originalFormat.isUpperCase},
                        hasAlpha: ${this.originalFormat.hasAlpha}
                    };

                    function formatFinalColor(baseColor, alpha) {
                        // Remove any existing alpha
                        const hex = parseColor(baseColor).hex;
                        
                        // Format according to original style
                        let color = formatSettings.isUpperCase ? hex.toUpperCase() : hex.toLowerCase();
                        
                        // Only add alpha if it was present originally or if it's been changed from FF
                        if (formatSettings.hasAlpha || alpha !== 255) {
                            const alphaHex = alpha.toString(16).padStart(2, '0');
                            color += formatSettings.isUpperCase ? alphaHex.toUpperCase() : alphaHex;
                        }
                        
                        return color;
                    }

                    // Real-time updates for color picker
                    colorPicker.addEventListener('input', (e) => {
                        const alpha = parseInt(alphaSlider.value);
                        const newColor = formatFinalColor(e.target.value, alpha);
                        updateAllControls(newColor);
                        vscode.postMessage({
                            command: 'colorChanged',
                            color: newColor
                        });
                    });

                    // Real-time updates for hex input
                    hexInput.addEventListener('input', (e) => {
                        let color = e.target.value;
                        if (!color.startsWith('#')) {
                            color = '#' + color;
                        }
                        
                        if (isValidHex(color)) {
                            const formatted = formatFinalColor(color, parseInt(alphaSlider.value));
                            updateAllControls(formatted);
                            vscode.postMessage({
                                command: 'colorChanged',
                                color: formatted
                            });
                        }
                    });

                    // Real-time updates for alpha slider
                    alphaSlider.addEventListener('input', (e) => {
                        const alpha = parseInt(e.target.value);
                        const newColor = formatFinalColor(colorPicker.value, alpha);
                        updateAllControls(newColor);
                        vscode.postMessage({
                            command: 'colorChanged',
                            color: newColor
                        });
                    });


                    // Re-enable undo when color picker selection is done
                    colorPicker.addEventListener('change', (e) => {
                        vscode.postMessage({
                            command: 'colorChangeComplete',
                            color: hexInput.value
                        });
                    });

                    // Re-enable undo when hex input loses focus
                    hexInput.addEventListener('change', (e) => {
                        vscode.postMessage({
                            command: 'colorChangeComplete',
                            color: hexInput.value
                        });
                    });

                    // Re-enable undo when alpha slider is released
                    alphaSlider.addEventListener('change', (e) => {
                        vscode.postMessage({
                            command: 'colorChangeComplete',
                            color: hexInput.value
                        });
                    });

                    // Handle updates from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'updateColor') {
                            updateAllControls(message.color);
                        }
                    });

                    // Initial update
                    updateAllControls(initialColor);
                </script>
            </body>
            </html>
        `;
    }

    static createOrShow(range: Range, editor: TextEditor, initialColor: string) {
        if (ColorPickerPanel.currentPanel) {
            ColorPickerPanel.currentPanel.currentRange = range;
            ColorPickerPanel.currentPanel.panel?.webview.postMessage({
                command: 'updateColor',
                color: initialColor
            });
        } else {
            ColorPickerPanel.currentPanel = new ColorPickerPanel(range, editor, initialColor);
        }
    }
}