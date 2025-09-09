const { spawn, spawnSync } = require('child_process');
const { existsSync } = require('fs');

console.log('🎯 MATDEV Bot Auto-Manager');
console.log('📍 Working in:', __dirname);

// Your GitHub repository - UPDATE THIS WITH YOUR ACTUAL REPO URL
const GITHUB_REPO = 'https://github.com/marhthing/matdev.git';

// Check if this is an initial setup, restart, or forced update
const isInitialSetup = !existsSync('bot.js') || !existsSync('config.js') || !existsSync('package.json');
const isForcedUpdate = existsSync('.update_flag.json');

if (isInitialSetup || isForcedUpdate) {
    if (isForcedUpdate) {
        console.log('🔄 Forced update detected - recloning from GitHub...');
    } else {
        console.log('🔧 Initial setup detected - cloning from GitHub...');
    }
    cloneAndSetup();
} else {
    // Only load manager commands after files exist
    try {
        const ManagerCommands = require('./lib/manager');
        const managerCommands = new ManagerCommands(GITHUB_REPO);
        
        // Expose essential manager commands globally  
        console.log('🔧 Setting up manager commands...');
        global.managerCommands = {
            restart: () => managerCommands.restart(),
            shutdown: () => managerCommands.shutdown(),
            checkUpdates: () => managerCommands.checkUpdates(),
            updateNow: () => managerCommands.updateNow()
        };
        
        console.log('✅ Manager commands ready and available globally');
    } catch (error) {
        console.log('⚠️  Manager commands not available (files may be missing)');
    }
    
    console.log('🚀 Starting MATDEV bot...');
    startBot();
}

// Check and install dependencies intelligently
async function checkAndInstallDependencies() {
    if (!existsSync('package.json')) {
        console.log('⚠️  No package.json found, skipping dependency check');
        return;
    }

    console.log('🔍 Checking dependencies...');
    
    // Check if node_modules exists
    if (existsSync('node_modules')) {
        console.log('📦 node_modules found, checking package integrity...');
        
        try {
            // Run npm list to check if all packages are properly installed
            const checkResult = spawnSync('npm', ['list', '--depth=0'], { 
                stdio: 'pipe',
                encoding: 'utf8'
            });
            
            // If npm list shows issues or missing packages, reinstall
            if (checkResult.status !== 0) {
                console.log('⚠️  Package integrity issues detected, reinstalling...');
                await installDependencies();
            } else {
                // Check if package.json has new dependencies
                const packageJson = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
                const installedPackages = {};
                
                // Parse npm list output to get installed packages
                if (checkResult.stdout) {
                    const lines = checkResult.stdout.split('\n');
                    for (const line of lines) {
                        const match = line.match(/[├└]── (\S+)@/);
                        if (match) {
                            installedPackages[match[1]] = true;
                        }
                    }
                }
                
                // Check for missing dependencies
                const allDeps = {
                    ...(packageJson.dependencies || {}),
                    ...(packageJson.devDependencies || {})
                };
                
                const missingDeps = Object.keys(allDeps).filter(dep => !installedPackages[dep]);
                
                if (missingDeps.length > 0) {
                    console.log(`📥 Found ${missingDeps.length} new dependencies, installing...`);
                    await installDependencies();
                } else {
                    console.log('✅ All dependencies are up to date');
                }
            }
        } catch (error) {
            console.log('⚠️  Error checking dependencies, reinstalling...', error.message);
            await installDependencies();
        }
    } else {
        console.log('📦 node_modules not found, installing dependencies...');
        await installDependencies();
    }
}

// Install dependencies function
async function installDependencies() {
    console.log('📦 Installing dependencies...');
    const installResult = spawnSync('npm', ['install', '--production'], {
        stdio: 'inherit'
    });

    if (installResult.error || installResult.status !== 0) {
        console.error('❌ Failed to install dependencies');
        process.exit(1);
    }
    console.log('✅ Dependencies installed!');
}

// Update index.js after bot starts (delayed update)
function updateIndexJs() {
    try {
        if (existsSync('temp_clone/index.js')) {
            console.log('🔄 Updating index.js for next restart...');
            spawnSync('cp', ['temp_clone/index.js', 'index.js.new'], { stdio: 'inherit' });
            spawnSync('mv', ['index.js.new', 'index.js'], { stdio: 'inherit' });
            console.log('✅ index.js updated for next restart');
        } else if (existsSync('index.js.update')) {
            console.log('🔄 Applying delayed index.js update...');
            spawnSync('mv', ['index.js.update', 'index.js'], { stdio: 'inherit' });
            console.log('✅ index.js updated');
        }
    } catch (error) {
        console.log('⚠️  Could not update index.js:', error.message);
    }
}

async function cloneAndSetup() {
    console.log('📥 Cloning bot from GitHub...');
    console.log('🔗 Repository:', GITHUB_REPO);

    // Clean workspace (preserve important files)
    console.log('🧹 Cleaning workspace (preserving session folder, .env, and node_modules)...');
    spawnSync('bash', ['-c', 'find . -maxdepth 1 ! -name "." ! -name "index.js" ! -name "session" ! -name ".env" ! -name "node_modules" -exec rm -rf {} +'], { stdio: 'inherit' });

    // Clone repository
    const cloneResult = spawnSync('git', ['clone', GITHUB_REPO, 'temp_clone'], {
        stdio: 'inherit'
    });

    if (cloneResult.error || cloneResult.status !== 0) {
        console.error('❌ Failed to clone repository!');
        console.error('Error:', cloneResult.error?.message || `Exit code: ${cloneResult.status}`);
        process.exit(1);
    }

    // Backup and move files
    console.log('📁 Moving bot files (preserving existing .env)...');
    spawnSync('bash', ['-c', 'cp .env .env.backup 2>/dev/null || true'], { stdio: 'inherit' });
    
    const moveResult = spawnSync('bash', ['-c', 'cp -r temp_clone/. . && rm -rf temp_clone'], {
        stdio: 'inherit'
    });
    
    spawnSync('bash', ['-c', 'mv .env.backup .env 2>/dev/null || true'], { stdio: 'inherit' });

    if (moveResult.error || moveResult.status !== 0) {
        console.error('❌ Failed to move bot files!');
        console.error('Error:', moveResult.error?.message || `Exit code: ${moveResult.status}`);
        process.exit(1);
    }

    console.log('✅ Bot files moved successfully!');

    // Find entry point
    let entryPoint = findEntryPoint();
    if (!entryPoint) {
        console.error('❌ No bot entry point found!');
        process.exit(1);
    }
    console.log(`✅ Found bot entry point: ${entryPoint}`);

    // Check and install dependencies intelligently
    await checkAndInstallDependencies();

    // Start the bot
    startBot(entryPoint);
    
    // Update index.js after bot starts successfully (delayed update)
    setTimeout(() => {
        updateIndexJs();
    }, 15000);
    
    // Send update completion notification after successful setup (if manager is available)
    setTimeout(() => {
        try {
            if (global.managerCommands && global.managerCommands.sendUpdateCompleteNotification) {
                global.managerCommands.sendUpdateCompleteNotification();
            } else {
                console.log('✅ Setup complete! Bot is ready to use.');
            }
        } catch (error) {
            console.log('✅ Setup complete! Bot is ready to use.');
        }
    }, 10000);
}

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
                // Check for update requests
                const isInitialSetup = !existsSync('bot.js') || !existsSync('package.json');
                const isForcedUpdate = existsSync('.update_flag.json');
                
                if (isInitialSetup || isForcedUpdate) {
                    console.log('🔄 Update triggered - initiating recloning process...');
                    cloneAndSetup();
                    return;
                }
                
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
            console.log('🛑 Bot stopped by manager');
        }
    });

    botProcess.on('error', (error) => {
        console.error('❌ Bot start error:', error.message);
    });

    // Handle process signals
    process.on('SIGUSR1', () => {
        console.log('🔄 Received restart signal, restarting bot...');
        botProcess.kill('SIGTERM');
        setTimeout(() => startBot(entryPoint), 2000);
    });

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

    console.log('✅ Bot manager running!');
}

// Prevent manager from exiting unexpectedly  
process.on('uncaughtException', (error) => {
    console.error('❌ Manager uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Manager unhandled rejection:', reason);
});
