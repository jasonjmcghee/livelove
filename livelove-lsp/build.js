const fs = require('fs');
const path = require('path');

// Ensure the out directory exists
const outDir = path.join(__dirname, 'out');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
}

// Copy the WASM file
let wasmSource = require.resolve('./tree-sitter-lua.wasm');
let wasmDest = path.join(__dirname, 'out', 'tree-sitter-lua.wasm');
fs.copyFileSync(wasmSource, wasmDest);

console.log('Tree-sitter Lua WASM file copied to:', wasmDest);

// Copy the WASM file
wasmSource = require.resolve('./tree-sitter-glsl.wasm');
wasmDest = path.join(__dirname, 'out', 'tree-sitter-glsl.wasm');
fs.copyFileSync(wasmSource, wasmDest);

console.log('Tree-sitter GLSL WASM file copied to:', wasmDest);