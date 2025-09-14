const fs = require('fs');
const { exec } = require('child_process');

console.log('🔍 CPU & Resource Monitor for WhatsApp Bot');
console.log('==========================================\n');

// Function to monitor CPU
function checkCPU() {
    exec('ps aux --sort=-%cpu | head -10', (error, stdout) => {
        if (error) return;
        
        console.log(`📊 TOP CPU PROCESSES [${new Date().toLocaleTimeString()}]:`);
        console.log(stdout);
        
        // Extract bot-related processes
        const lines = stdout.split('\n');
        let botCPU = 0;
        let typescriptCPU = 0;
        
        lines.forEach(line => {
            if (line.includes('node') && line.includes('bot.js')) {
                const parts = line.split(/\s+/);
                botCPU = parseFloat(parts[2]) || 0;
                console.log(`🤖 Bot Process CPU: ${botCPU}%`);
            }
            if (line.includes('tsserver')) {
                const parts = line.split(/\s+/);
                typescriptCPU += parseFloat(parts[2]) || 0;
            }
        });
        
        if (typescriptCPU > 0) {
            console.log(`📝 TypeScript Server CPU: ${typescriptCPU}%`);
        }
        
        console.log('─'.repeat(50));
    });
}

// Function to check Node.js internals  
function checkNodeInternals() {
    console.log(`💾 NODE.JS MEMORY [${new Date().toLocaleTimeString()}]:`);
    const mem = process.memoryUsage();
    console.log(`  Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  External: ${(mem.external / 1024 / 1024).toFixed(2)} MB`);
    
    console.log(`\n⚡ ACTIVE HANDLES: ${process._getActiveHandles().length}`);
    console.log(`📋 ACTIVE REQUESTS: ${process._getActiveRequests().length}`);
    
    // Check for timers/intervals
    const handles = process._getActiveHandles();
    let timers = 0;
    let sockets = 0;
    let other = 0;
    
    handles.forEach(handle => {
        if (handle.constructor.name.includes('Timer')) timers++;
        else if (handle.constructor.name.includes('Socket')) sockets++;
        else other++;
    });
    
    console.log(`  Timers/Intervals: ${timers}`);
    console.log(`  Sockets: ${sockets}`);
    console.log(`  Other: ${other}`);
    console.log('─'.repeat(50));
}

// Function to check file operations
function checkFileOps() {
    exec('lsof -p ' + process.pid + ' | grep REG | wc -l', (error, stdout) => {
        if (!error) {
            console.log(`📁 OPEN FILES: ${stdout.trim()}`);
        }
    });
    
    // Check for frequent file access
    exec('find . -name "*.json" -newermt "1 minute ago" 2>/dev/null', (error, stdout) => {
        if (!error && stdout.trim()) {
            console.log(`🔄 RECENTLY MODIFIED FILES:`);
            console.log(stdout);
        }
    });
}

// Run initial check
checkCPU();
checkNodeInternals();
checkFileOps();

// Monitor every 10 seconds
setInterval(() => {
    console.log('\n' + '='.repeat(50));
    checkCPU();
    checkNodeInternals();
    checkFileOps();
}, 10000);

console.log('\n🔍 Monitoring every 10 seconds. Press Ctrl+C to stop.');