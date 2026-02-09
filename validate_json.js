const fs = require('fs');

let content = fs.readFileSync('capabilities.json', 'utf8');

// Check BOM
if (content.charCodeAt(0) === 0xFEFF) {
    console.log("BOM detected! Removing it.");
    content = content.slice(1);
    fs.writeFileSync('capabilities.json', content, 'utf8');
} else {
    console.log("No BOM detected.");
}

// Brace counting
let balance = 0;
for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') balance++;
    if (content[i] === '}') balance--;
}
console.log("Final Brace Balance (should be 0):", balance);

if (balance !== 0) {
    console.log("Mismatch! Scanning for likely location...");
}

try {
    JSON.parse(content);
    console.log("JSON is now valid.");
} catch (e) {
    console.error("Parse Error:", e.message);
}
