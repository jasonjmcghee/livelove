import Parser, { Language } from 'web-tree-sitter';
import * as path from 'path';
import { TextDocument, TextLine } from 'vscode';

let LuaLang: Language | null = null;
let GlslLang: Language | null = null;

interface TokenInfo {
    text: string;
    tokenType: string;
}

interface DocumentCache {
    version: number;
    tree: Parser.Tree;
    query: Parser.Query;
    captures: Parser.QueryCapture[];
}

export class TreeSitterHighlighter {
    private luaParser: Parser | null = null;
    private glslParser: Parser | null = null;
    private documentCache: Map<string, DocumentCache> = new Map();
    private initialized = false;
    private luaQuery: Parser.Query | null = null;
    private glslQuery: Parser.Query | null = null;

    async initialize() {
        if (this.initialized) return;

        await Parser.init();
        this.luaParser = new Parser();
        this.glslParser = new Parser();
        
        const luaWasmPath = path.join(__dirname, 'tree-sitter-lua.wasm');
        const glslWasmPath = path.join(__dirname, 'tree-sitter-glsl.wasm');
        LuaLang = await Parser.Language.load(luaWasmPath);
        GlslLang = await Parser.Language.load(glslWasmPath);

        this.luaParser.setLanguage(LuaLang);

        this.luaQuery = this.luaParser.getLanguage().query(`     
            ; Basic node types we know work
            (identifier) @variable
            (string) @string
            (number) @number
            (comment) @comment 
            
            ; Function/method patterns 
            (method_index_expression 
            table: (identifier) @class
            method: (identifier) @method)

            ; Function declarations
            (function_declaration 
            name: (identifier) @function)

            ; Parameters in functions
            (arguments 
            (identifier) @parameter)
            (parameters
            (identifier) @parameter)

            ; Table access
            (dot_index_expression
            table: (identifier)
            field: (identifier) @property)

            ; Keywords - using square brackets for matching
            [
              "function"
              "local"
              "return"
              "if"
              "then"
              "else"
              "elseif"
              "end"
              "do"
              "while"
              "for"
              "in"
              "repeat"
              "until"
            ] @keyword

            ; Operators in a group
            [
              "+"
              "-"
              "*"
              "/"
              "%"
              "^"
              "#"
              "=="
              "~="
              "<="
              ">="
              "<"
              ">"
              "="
              "and"
              "or"
              "not"
              ".."
              ":"
            ] @operator
        `);

        this.glslParser.setLanguage(GlslLang);

        // GLSL query
        this.glslQuery = this.glslParser.getLanguage().query(`
            "break" @keyword
"case" @keyword
"const" @keyword
"continue" @keyword
"default" @keyword
"do" @keyword
"else" @keyword
"enum" @keyword
"extern" @keyword
"for" @keyword
"if" @keyword
"inline" @keyword
"return" @keyword
"sizeof" @keyword
"static" @keyword
"struct" @keyword
"switch" @keyword
"typedef" @keyword
"union" @keyword
"volatile" @keyword
"while" @keyword

"#define" @keyword
"#elif" @keyword
"#else" @keyword
"#endif" @keyword
"#if" @keyword
"#ifdef" @keyword
"#ifndef" @keyword
"#include" @keyword
(preproc_directive) @keyword

"--" @operator
"-" @operator
"-=" @operator
"->" @operator
"=" @operator
"!=" @operator
"*" @operator
"&" @operator
"&&" @operator
"+" @operator
"++" @operator
"+=" @operator
"<" @operator
"==" @operator
">" @operator
"||" @operator

"." @delimiter
";" @delimiter

(string_literal) @string
(system_lib_string) @string

(null) @constant
(number_literal) @number
(char_literal) @number

(call_expression
  function: (identifier) @function)
(call_expression
  function: (field_expression
    field: (field_identifier) @function))
(function_declarator
  declarator: (identifier) @function)
(preproc_function_def
  name: (identifier) @function.special)

(field_identifier) @property
(statement_identifier) @label
(type_identifier) @type
(primitive_type) @type
(sized_type_specifier) @type

((identifier) @constant
 (#match? @constant "^[A-Z][A-Z\\d_]*$"))

(identifier) @variable

(comment) @comment
; inherits: c
[
  "in"
  "out"
  "inout"
  "uniform"
  "shared"
  "layout"
  "attribute"
  "varying"
  "buffer"
  "coherent"
  "readonly"
  "writeonly"
  "precision"
  "highp"
  "mediump"
  "lowp"
  "centroid"
  "sample"
  "patch"
  "smooth"
  "flat"
  "noperspective"
  "invariant"
  "precise"
] @type.qualifier

"subroutine" @keyword.function

(extension_storage_class) @keyword.storage

((identifier) @variable.builtin
  (#lua-match? @variable.builtin "^gl_"))
        `);

        this.initialized = true;
    }

    private async ensureDocument(document: TextDocument): Promise<DocumentCache> {
        await this.initialize();

        const uri = document.uri.toString();
        const cache = this.documentCache.get(uri);

        if (cache && cache.version === document.version) {
            return cache;
        }

        if (!this.luaParser || !this.glslParser || !this.luaQuery || !this.glslQuery) {
            throw new Error('Highlighter not properly initialized');
        }

        const isLua = uri.endsWith("lua");
        let query = isLua ? this.luaQuery : this.glslQuery;
        const parser = isLua ? this.luaParser : this.glslParser;
        const tree = parser.parse(document.getText());
        const captures = query.captures(tree.rootNode);
        
        const newCache: DocumentCache = {
            version: document.version,
            tree,
            query,
            captures
        };

        this.documentCache.set(uri, newCache);
        return newCache;
    }

    async getLineTokens(document: TextDocument, line: TextLine): Promise<TokenInfo[]> {
        const cache = await this.ensureDocument(document);
        const tokens: TokenInfo[] = [];
        let lastEnd = 0;

        const lineStart = document.offsetAt(line.range.start);
        const lineEnd = lineStart + line.text.length;

        // Create an array to track all token boundaries and their types
        interface TokenBoundary {
            position: number;
            isStart: boolean;
            tokenType: string;
            priority: number;
            text: string;
        }

        const boundaries: TokenBoundary[] = [];

        // Helper function to determine token priority
        const getTokenPriority = (type: string): number => {
            switch (type) {
                case 'keyword': return 100;  // Highest priority
                case 'operator': return 90;
                case 'class': return 80;
                case 'method': return 70;
                case 'function': return 60;
                case 'argument': return 50;
                case 'parameter': return 40;
                case 'property': return 30;
                case 'variable': return 20;   // Lowest priority for identifiers
                default: return 10;
            }
        };

        // Process captures into boundaries
        for (const capture of cache.captures) {
            const node = capture.node;
            if (node.startIndex >= lineEnd || node.endIndex <= lineStart) continue;

            const startInLine = Math.max(0, node.startIndex - lineStart);
            const endInLine = Math.min(line.text.length, node.endIndex - lineStart);
            const text = line.text.substring(startInLine, endInLine);
            const priority = getTokenPriority(capture.name);

            boundaries.push(
                { position: startInLine, isStart: true, tokenType: capture.name, priority, text },
                { position: endInLine, isStart: false, tokenType: capture.name, priority, text }
            );
        }

        // Sort boundaries by position and priority
        boundaries.sort((a, b) => {
            if (a.position !== b.position) return a.position - b.position;
            // If positions are equal, prioritize end boundaries over start boundaries
            if (a.isStart !== b.isStart) return a.isStart ? 1 : -1;
            // If both are starts or both are ends, prioritize by token priority
            return b.priority - a.priority;
        });

        let currentPosition = 0;
        let activeTokens = new Set<string>();
        let currentTokenType = 'text';

        // Process boundaries to generate tokens
        for (const boundary of boundaries) {
            // Add text token if there's a gap
            if (boundary.position > currentPosition) {
                tokens.push({
                    text: line.text.substring(currentPosition, boundary.position),
                    tokenType: currentTokenType
                });
            }

            if (boundary.isStart) {
                activeTokens.add(boundary.tokenType);
            } else {
                activeTokens.delete(boundary.tokenType);
            }

            // Update current token type based on highest priority active token
            currentTokenType = Array.from(activeTokens)
                .sort((a, b) => getTokenPriority(b) - getTokenPriority(a))[0] || 'text';

            currentPosition = boundary.position;
        }

        // Add remaining text
        if (currentPosition < line.text.length) {
            tokens.push({
                text: line.text.substring(currentPosition),
                tokenType: 'text'
            });
        }

        return tokens;
    }

    clearCache(document: TextDocument) {
        this.documentCache.delete(document.uri.toString());
    }
}