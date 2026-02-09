const fs = require('fs');

const content = fs.readFileSync('capabilities.json', 'utf8');
const lines = content.split('\n');

let depth = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trim = line.trim();
    if (!trim) continue;

    // Check indentation
    const indent = line.search(/\S/);
    const expected = depth * 4;

    // Check braces in this line
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    // If line starts with closing brace, depth should be lower BEFORE this line check?
    // Usually closing brace line '    },' should match outer depth.
    // Let's simplified check:

    const effDepth = (trim.startsWith('}') || trim.startsWith(']')) ? depth - 1 : depth;

    if (indent !== effDepth * 4) {
        console.log(`Line ${i + 1} Indent Mismatch! Expected ${effDepth * 4} but got ${indent}. Content: ${trim}. Current Depth: ${depth}`);
    }

    depth += opens - closes;
    // Also track brackets
    depth += (line.match(/\[/g) || []).length - (line.match(/\]/g) || []).length;
}

console.log(`Final Depth: ${depth}`);
