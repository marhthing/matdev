const { spawn } = require('child_process');
const { existsSync } = require('fs');

console.log('🎯 MATDEV Bot - Replit Environment');
console.log('📍 Working in:', __dirname);

// Replit environment - run directly without GitHub cloning
console.log('🚀 Starting MATDEV bot in Replit environment...');

// Only load manager commands if available
try {
    const ManagerCommands = require('./lib/manager');
    const managerCommands = new ManagerCommands('');
    
    // Expose essential manager commands globally  
    console.log('🔧 Setting up manager commands...');
    global.managerCommands = {
        restart: () => managerCommands.restart(),
        shutdown: () => managerCommands.shutdown()
    };
    
    console.log('✅ Manager commands ready');
} catch (error) {
    console.log('⚠️ Manager commands not available (continuing without them)');
}

// Start the bot directly
startBot();

// Find the bot entry point
function findEntryPoint() {
    const possibleEntryPoints = ['bot.js', 'app.js', 'main.js', 'src/index.js'];
    
    for (const file of possibleEntryPoints) {
        if (existsSync(file)) {
            return file;
        }
    }

    // Check package.json for main field
    if (existsSync('package.json')) {
        try {
            const packageJson = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
            if (packageJson.main && existsSync(packageJson.main)) {
                return packageJson.main;
            }
        } catch (err) {
            console.log('⚠️ Could not read package.json main field');
        }
    }

    return null;
}

function startBot(entryPoint = 'bot.js') {
    console.log(`🚀 Starting bot: ${entryPoint}`);

    const botProcess = spawn('node', [entryPoint], {
        stdio: 'inherit'
    });

    let restartCount = 0;
    const maxRestarts = 5;

    botProcess.on('exit', (code, signal) => {
        console.log(`🔄 Bot exited with code ${code}, signal ${signal}`);
        
        if (signal !== 'SIGTERM' && signal !== 'SIGINT') {
            if (code === 0) {
                console.log(`🔄 Restarting bot as requested...`);
                setTimeout(() => startBot(entryPoint), 2000);
            } else {
                restartCount++;
                if (restartCount <= maxRestarts) {
                    console.log(`🔄 Restarting bot after crash... (${restartCount}/${maxRestarts})`);
                    setTimeout(() => startBot(entryPoint), 2000);
                } else {
                    console.error('❌ Too many crash restarts, stopping');
                    process.exit(1);
                }
            }
        } else {
            console.log('🛑 Bot stopped');
        }
    });

    botProcess.on('error', (error) => {
        console.error('❌ Bot start error:', error.message);
    });

    // Handle process signals
    process.on('SIGTERM', () => {
        console.log('🛑 Received shutdown signal, stopping bot...');
        botProcess.kill('SIGTERM');
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('🛑 Received interrupt signal, stopping bot...');
        botProcess.kill('SIGINT');
        process.exit(0);
    });

    console.log('✅ Bot manager running in Replit!');
}

// Prevent manager from exiting unexpectedly  
process.on('uncaughtException', (error) => {
    console.error('❌ Manager uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Manager unhandled rejection:', reason);
});
