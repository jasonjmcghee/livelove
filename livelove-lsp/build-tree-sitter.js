const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function buildParser(grammarName) {
    console.log(`Building ${grammarName} parser...`);
    
    // Path to node_modules parser directory
    const parserPath = path.join(__dirname, 'node_modules', `tree-sitter-${grammarName}`);
    
    // Create the output directory if it doesn't exist
    const outputDir = path.join(__dirname, 'parsers');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    try {
        // Navigate to the parser directory
        process.chdir(parserPath);

        // Generate the parser
        execSync('tree-sitter generate');

        // Build the WASM file using the new command
        execSync('tree-sitter build-wasm --docker');  // Using docker ensures consistent builds
        // Alternative without docker: execSync('tree-sitter build-wasm');

        // Copy the WASM file to your parsers directory
        const wasmFiles = fs.readdirSync('.').filter(f => f.endsWith('.wasm'));
        if (wasmFiles.length === 0) {
            throw new Error('No WASM file generated');
        }
        
        fs.copyFileSync(
            path.join(parserPath, wasmFiles[0]),
            path.join(outputDir, `tree-sitter-${grammarName}.wasm`)
        );

        console.log(`Successfully built ${grammarName} parser`);
    } catch (error) {
        console.error(`Error building ${grammarName} parser:`, error);
        throw error;
    }
}

// Build parsers
Promise.all([
    buildParser('glsl'),
    // buildParser('lua')  // Uncomment if you need to rebuild Lua parser too
]).catch(error => {
    console.error('Failed to build parsers:', error);
    process.exit(1);
});