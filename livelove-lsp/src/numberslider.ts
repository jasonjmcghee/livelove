import { WebviewPanel, TextEditor, Range, window, ViewColumn, Position, Selection } from "vscode";

export class SliderPanel {
    static currentPanel: SliderPanel | undefined;
    panel: WebviewPanel | null = null;
    private readonly editor: TextEditor;
    currentRange: Range;
    value: number;
    private decimalPlaces: number;
    private undoDisabled = false;

    private constructor(range: Range, editor: TextEditor, value: number) {
        this.editor = editor;
        this.currentRange = range;
        this.value = value;
        this.decimalPlaces = this.getDecimalPlaces(editor.document.getText(range));
        this.initializePanel();
    }

    private getDecimalPlaces(text: string): number {
        const match = text.match(/\.\d+/);
        return match ? match[0].length - 1 : 0;
    }

    private initializePanel() {
        this.panel = window.createWebviewPanel(
            'numberSlider',
            'Adjust Value',
            ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'valueChanged':
                        if (!this.undoDisabled) {
                            // Disable undo on first change
                            this.undoDisabled = true;
                            this.editor.edit(builder => {}, { 
                                undoStopBefore: true,
                                undoStopAfter: false 
                            });
                        }
                        this.updateEditorValue(message.value, false);
                        break;
                    case 'setValueAndDecimals':
                        this.decimalPlaces = this.getDecimalPlaces(message.value);
                        this.updateEditorValue(message.value, false);
                        break;
                    case 'slidingComplete':
                        // Re-enable undo when sliding is done
                        this.updateEditorValue(message.value, true);
                        this.undoDisabled = false;
                        break;
                }
            },
            undefined
        );

        this.panel.onDidDispose(() => {
            SliderPanel.currentPanel = undefined;
        });
    }

    static createOrShow(range: Range, editor: TextEditor, value: number) {
        const selectedText = editor.document.getText(range);
        
        if (SliderPanel.currentPanel) {
            SliderPanel.currentPanel.currentRange = range;
            SliderPanel.currentPanel.value = value;
            SliderPanel.currentPanel.updatePanel(selectedText);
        } else {
            SliderPanel.currentPanel = new SliderPanel(range, editor, value);
        }
    }

    private updateEditorValue(newValue: string | number, createUndoStop: boolean) {
        const finalValue = typeof newValue === 'string' ? newValue : (
            this.decimalPlaces === 0 ? 
                String(Math.round(newValue)) : 
                Number(newValue).toFixed(this.decimalPlaces)
        );

        this.editor.edit(builder => {
            builder.replace(this.currentRange, finalValue);
        }, {
            undoStopBefore: false,
            undoStopAfter: createUndoStop
        }).then(() => {
            const startPos = this.currentRange.start;
            const endPos = new Position(startPos.line, startPos.character + finalValue.length);
            this.currentRange = new Range(startPos, endPos);
            this.editor.selection = new Selection(startPos, endPos);
        });
    }

    private updatePanel(selectedText: string) {
        const value = parseFloat(selectedText);
        const magnitude = Math.abs(value) * 2 + 1;

        this.panel?.webview.postMessage({
            command: 'updateConfig',
            value: value,
            min: value - magnitude,
            max: value + magnitude,
            step: 1 / Math.pow(10, this.decimalPlaces)
        });
    }

    private getWebviewContent() {
        const magnitude = Math.abs(this.value) * 2 + 1;
        const min = this.value - magnitude;
        const max = this.value + magnitude;
        // Make step size respect decimal places
        const step = 1 / Math.pow(10, this.decimalPlaces);
    
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        padding: 4px;
                        margin: 0;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        height: 40px;
                        font-family: var(--vscode-font-family);
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        overflow: hidden;
                    }
                    .slider-container {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 8px;
                        min-width: 0;
                    }
                    .range-row {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        width: 100%;
                    }
                    .range-label {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        min-width: 45px;
                    }
                    .range-label.end {
                        text-align: right;
                    }
                    input[type="range"] {
                        flex: 1;
                        height: 2px;
                        -webkit-appearance: none;
                        background: var(--vscode-scrollbarSlider-background);
                        min-width: 0;
                    }
                    input[type="range"]::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        height: 12px;
                        width: 12px;
                        border-radius: 50%;
                        background: var(--vscode-button-background);
                        cursor: pointer;
                    }
                    input[type="range"]:focus {
                        outline: none;
                    }
                    input[type="number"] {
                        width: 80px;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 2px 4px;
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                    }
                </style>
            </head>
            <body>
                <div class="slider-container">
                    <input type="number" 
                        value="${this.value}" 
                        id="numberInput"
                        step="any">
                    <div class="range-row">
                        <span class="range-label" id="minLabel">${min.toFixed(this.decimalPlaces)}</span>
                        <input type="range" 
                               min="${min}" 
                               max="${max}" 
                               value="${this.value}" 
                               step="${step}"
                               id="slider">
                        <span class="range-label end" id="maxLabel">${max.toFixed(this.decimalPlaces)}</span>
                    </div>
                </div>
                <script>
                    const slider = document.getElementById('slider');
                    const numberInput = document.getElementById('numberInput');
                    const vscode = acquireVsCodeApi();

                     // Add the missing postMessage function
                    function postMessage(message) {
                        vscode.postMessage(message);
                    }

                    numberInput.oninput = (e) => {
                        const value = e.target.value;
                        if (value === '' || value === '-') return;
                        
                        postMessage({
                            command: 'valueChanged',
                            value: value
                        });
                    };

                    numberInput.onchange = (e) => {
                        const value = e.target.value;
                        if (value === '' || value === '-') return;
                        
                        postMessage({
                            command: 'slidingComplete',
                            value: value
                        });
                        
                        // Update range...
                        const numValue = parseFloat(value);
                        const magnitude = Math.abs(numValue) * 2 + 1;
                        const min = numValue - magnitude;
                        const max = numValue + magnitude;
                        
                        slider.min = min;
                        slider.max = max;
                        minLabel.textContent = min.toFixed(2);
                        maxLabel.textContent = max.toFixed(2);
                    };

                    slider.oninput = (e) => {
                        const value = Number(e.target.value);
                        numberInput.value = value;
                        postMessage({
                            command: 'valueChanged',
                            value: value
                        });
                    };

                    slider.onchange = (e) => {
                        const value = Number(e.target.value);
                        postMessage({
                            command: 'slidingComplete',
                            value: value
                        });
                        
                        // Update range...
                        const magnitude = Math.abs(value) * 2 + 1;
                        const min = value - magnitude;
                        const max = value + magnitude;
                        
                        slider.min = min;
                        slider.max = max;
                        minLabel.textContent = min.toFixed(2);
                        maxLabel.textContent = max.toFixed(2);
                    };

                    // Handle updates from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'updateConfig') {
                            slider.min = message.min;
                            slider.max = message.max;
                            slider.step = message.step;
                            slider.value = message.value;
                            numberInput.value = message.value;
                            minLabel.textContent = message.min.toFixed(2);
                            maxLabel.textContent = message.max.toFixed(2);
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}