const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const tempFilePath = path.join(__dirname, "test_receipt.txt");
fs.writeFileSync(tempFilePath, "Raw text testing direct hardware print\r\n", "utf8");

const printerShareName = process.env.PRINTER_NAME || "Generic  Text Only";
const cmdCommand = `copy /b "${tempFilePath}" "\\\\localhost\\${printerShareName}"`;

console.log("Executing command:", cmdCommand);

exec(cmdCommand, (error, stdout, stderr) => {
    console.log("Error object:", error);
    console.log("Stdout:", stdout);
    console.log("Stderr:", stderr);
    
    // Clean up
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
});
