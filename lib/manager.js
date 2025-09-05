/**
 * MATDEV Manager Commands
 * Complex manager functionality moved from index.js for better organization
 */

const { spawnSync } = require('child_process');
const fs = require('fs');

class ManagerCommands {
    constructor(githubRepo) {
        this.GITHUB_REPO = githubRepo;
    }

    /**
     * Check for updates from GitHub repository
     */
    async checkUpdates() {
        try {
            console.log('🔍 Checking for updates...');
            
            // Fetch latest commit from GitHub
            const result = spawnSync('git', ['ls-remote', this.GITHUB_REPO, 'HEAD'], {
                encoding: 'utf8',
                stdio: ['inherit', 'pipe', 'inherit']
            });
            
            if (result.error || result.status !== 0) {
                return { error: 'Failed to check remote repository' };
            }
            
            const remoteCommit = result.stdout.split('\t')[0];
            
            // Get local commit if git repo exists
            let localCommit = null;
            if (fs.existsSync('.git')) {
                const localResult = spawnSync('git', ['rev-parse', 'HEAD'], {
                    encoding: 'utf8',
                    stdio: ['inherit', 'pipe', 'inherit']
                });
                
                if (localResult.status === 0) {
                    localCommit = localResult.stdout.trim();
                }
            }
            
            if (!localCommit || localCommit !== remoteCommit) {
                return { 
                    updateAvailable: true, 
                    message: `Updates available! Local: ${localCommit?.substring(0, 7) || 'none'}, Remote: ${remoteCommit.substring(0, 7)}` 
                };
            } else {
                return { 
                    updateAvailable: false, 
                    message: 'Bot is up to date!' 
                };
            }
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Force update by triggering reclone process
     */
    updateNow() {
        console.log('🔄 Force update requested - bypassing all checks and recloning repository...');
        
        // Create update flag for completion notification
        const updateInfo = {
            timestamp: Date.now(),
            requestedAt: new Date().toISOString()
        };
        fs.writeFileSync('.update_flag.json', JSON.stringify(updateInfo, null, 2));
        
        // Force immediate recloning by removing ALL key files
        setTimeout(() => {
            console.log('🔄 Force removing ALL key files to trigger complete recloning...');
            const filesToRemove = ['bot.js', 'config.js', 'package.json'];
            
            try {
                for (const file of filesToRemove) {
                    try {
                        fs.unlinkSync(file);
                        console.log(`✅ ${file} removed`);
                    } catch (err) {
                        console.log(`ℹ️ ${file} not found or already removed`);
                    }
                }
                console.log('✅ All files removed - forced recloning will be triggered');
            } catch (error) {
                console.error('❌ Failed to remove files:', error);
            }
            
            console.log('🔄 Forcing process exit to trigger complete recloning from index.js...');
            process.exit(1);
        }, 1000);
        
        return { message: 'Force update initiated - bot will restart with latest code from GitHub' };
    }

    /**
     * Send update completion notification
     */
    async sendUpdateCompleteNotification() {
        try {
            const updateFlagPath = '.update_flag.json';
            
            if (!fs.existsSync(updateFlagPath)) {
                return; // Not an update, skip notification
            }
            
            console.log('📤 Sending update completion notification...');
            console.log('✅ Update completed successfully - fresh code from GitHub');
            console.log('🕐 Updated at:', new Date().toLocaleString());
            
            // Clean up flag file
            fs.unlinkSync(updateFlagPath);
        } catch (error) {
            console.log('Error sending update notification:', error);
        }
    }

    /**
     * Basic restart function
     */
    restart() {
        console.log('🔄 Restart requested via bot command');
        process.kill(process.pid, 'SIGUSR1');
    }

    /**
     * Basic shutdown function  
     */
    shutdown() {
        console.log('🛑 Shutdown requested via bot command');
        process.kill(process.pid, 'SIGTERM');
    }
}

module.exports = ManagerCommands;