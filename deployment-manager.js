const { spawn, spawnSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const path = require('path');

class DeploymentManager {
    constructor() {
        this.GITHUB_REPO = 'https://github.com/marhthing/aaa.git';
        this.APP_NAME = 'MATDEV-Bot';
    }

    /**
     * Check git status and differences
     */
    async checkGitStatus() {
        try {
            // Check if we're in a git repository
            const gitCheck = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
            if (gitCheck.error) {
                return { isGitRepo: false, hasChanges: false, ahead: 0, behind: 0 };
            }

            // Get local changes
            const hasLocalChanges = gitCheck.stdout.trim().length > 0;

            // Fetch remote changes
            spawnSync('git', ['fetch', 'origin'], { stdio: 'ignore' });

            // Check commits ahead/behind
            const aheadResult = spawnSync('git', ['rev-list', '--count', 'HEAD..origin/main'], { encoding: 'utf8' });
            const behindResult = spawnSync('git', ['rev-list', '--count', 'origin/main..HEAD'], { encoding: 'utf8' });

            const behind = parseInt(aheadResult.stdout.trim()) || 0;
            const ahead = parseInt(behindResult.stdout.trim()) || 0;

            return {
                isGitRepo: true,
                hasChanges: hasLocalChanges,
                ahead,
                behind,
                needsUpdate: behind > 0
            };
        } catch (error) {
            console.error('Git status check error:', error);
            return { isGitRepo: false, hasChanges: false, ahead: 0, behind: 0 };
        }
    }

    /**
     * Restart the bot using PM2
     */
    async restart() {
        try {
            console.log('🔄 Restarting MATDEV Bot...');
            
            const result = spawnSync('npx', ['pm2', 'restart', this.APP_NAME], { 
                stdio: 'inherit' 
            });

            if (result.error || result.status !== 0) {
                // If PM2 restart fails, try to start fresh
                console.log('🚀 Starting bot with PM2...');
                spawnSync('npx', ['pm2', 'start', 'ecosystem.config.js'], { 
                    stdio: 'inherit' 
                });
            }

            return { success: true, message: '✅ Bot restarted successfully!' };
        } catch (error) {
            console.error('Restart error:', error);
            return { success: false, message: '❌ Failed to restart bot' };
        }
    }

    /**
     * Shutdown the bot using PM2
     */
    async shutdown() {
        try {
            console.log('🛑 Shutting down MATDEV Bot...');
            
            const result = spawnSync('npx', ['pm2', 'stop', this.APP_NAME], { 
                stdio: 'inherit' 
            });

            return { success: true, message: '✅ Bot stopped successfully!' };
        } catch (error) {
            console.error('Shutdown error:', error);
            return { success: false, message: '❌ Failed to stop bot' };
        }
    }

    /**
     * Update bot from GitHub
     */
    async update(forceUpdate = false) {
        try {
            if (!forceUpdate) {
                const gitStatus = await this.checkGitStatus();
                
                if (!gitStatus.isGitRepo) {
                    return { 
                        success: false, 
                        message: '❌ Not a git repository. Use `.update now` to force update.' 
                    };
                }

                if (!gitStatus.needsUpdate) {
                    return { 
                        success: true, 
                        message: '✅ Bot is already up to date!' 
                    };
                }

                return {
                    success: false,
                    message: `📥 ${gitStatus.behind} update(s) available from GitHub.\nUse \`.update now\` to apply updates.`,
                    updateCount: gitStatus.behind
                };
            }

            // Force update process
            console.log('🔄 Force updating from GitHub...');
            
            // Stop the bot first
            await this.shutdown();

            // Clean workspace (except critical files)
            console.log('🧹 Cleaning workspace...');
            spawnSync('bash', ['-c', 'find . -maxdepth 1 ! -name "." ! -name "ecosystem.config.js" ! -name "deployment-manager.js" ! -name "node_modules" ! -name ".git" ! -name "logs" -exec rm -rf {} +'], { stdio: 'inherit' });

            // Clone repository
            console.log('📥 Cloning latest version...');
            const cloneResult = spawnSync('git', ['clone', this.GITHUB_REPO, '.'], {
                stdio: 'inherit'
            });

            if (cloneResult.error || cloneResult.status !== 0) {
                return { 
                    success: false, 
                    message: '❌ Failed to clone repository!' 
                };
            }

            // Install dependencies
            if (existsSync('package.json')) {
                console.log('📦 Installing dependencies...');
                const installResult = spawnSync('npm', ['install', '--production'], {
                    stdio: 'inherit'
                });

                if (installResult.error || installResult.status !== 0) {
                    return { 
                        success: false, 
                        message: '❌ Failed to install dependencies!' 
                    };
                }
            }

            // Restart with PM2
            console.log('🚀 Starting updated bot...');
            spawnSync('npx', ['pm2', 'start', 'ecosystem.config.js'], { 
                stdio: 'inherit' 
            });

            return { 
                success: true, 
                message: '✅ Bot updated and restarted successfully!' 
            };

        } catch (error) {
            console.error('Update error:', error);
            return { 
                success: false, 
                message: '❌ Update failed: ' + error.message 
            };
        }
    }

    /**
     * Get PM2 process status
     */
    async getStatus() {
        try {
            const result = spawnSync('npx', ['pm2', 'jlist'], { encoding: 'utf8' });
            if (result.error) {
                return { running: false, info: 'PM2 not available' };
            }

            const processes = JSON.parse(result.stdout || '[]');
            const botProcess = processes.find(p => p.name === this.APP_NAME);

            if (!botProcess) {
                return { running: false, info: 'Bot not found in PM2' };
            }

            return {
                running: botProcess.pm2_env.status === 'online',
                info: `Status: ${botProcess.pm2_env.status}, PID: ${botProcess.pid}, Uptime: ${botProcess.pm2_env.pm_uptime}`,
                restarts: botProcess.pm2_env.restart_time
            };
        } catch (error) {
            return { running: false, info: 'Status check failed' };
        }
    }
}

module.exports = DeploymentManager;