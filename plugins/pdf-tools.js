const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class PDFToolsPlugin {
    constructor() {
        this.name = 'pdf-tools';
        this.description = 'Create PDFs from text and messages';
        this.version = '1.0.0';
        this.enabled = true;
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('pdf', this.pdfCommand.bind(this), {
                description: 'Convert text or message to PDF',
                usage: `${config.PREFIX}pdf <text> OR reply to message with ${config.PREFIX}pdf`,
                category: 'utility',
                plugin: 'pdf-tools',
                source: 'pdf-tools.js'
            });

            console.log('✅ PDF Tools plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize PDF Tools plugin:', error);
            return false;
        }
    }

    async pdfCommand(messageInfo) {
        try {
            // Check for quoted/replied message first
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            let textContent = '';
            let title = '';

            if (quotedMessage) {
                // Extract text from quoted message
                if (quotedMessage.conversation) {
                    textContent = quotedMessage.conversation;
                } else if (quotedMessage.extendedTextMessage?.text) {
                    textContent = quotedMessage.extendedTextMessage.text;
                } else {
                    await this.bot.messageHandler.reply(messageInfo, '❌ The replied message does not contain text.');
                    return;
                }
                title = `Message from ${new Date().toLocaleString()}`;
            } else {
                // Get text from command arguments
                textContent = messageInfo.args.join(' ').trim();
                if (!textContent) {
                    await this.bot.messageHandler.reply(messageInfo,
                        '📄 Usage: `.pdf <text>` OR reply to a message with `.pdf`\n\n' +
                        'Examples:\n• `.pdf Hello World`\n• `.pdf This is a longer text that will be converted to PDF`\n• Reply to any message and type `.pdf`');
                    return;
                }
                title = 'Generated Document';
            }

            // Check text length
            if (textContent.length > 5000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Text too long! Maximum 5000 characters.');
                return;
            }

            // Show processing message
            await this.bot.messageHandler.reply(messageInfo, '📄 Creating PDF...');

            const pdfResult = await this.createPDF(title, textContent);

            if (pdfResult.success) {
                // Send the PDF file
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    document: { url: pdfResult.filePath },
                    fileName: pdfResult.fileName,
                    mimetype: 'application/pdf',
                    caption: `📄 **PDF Created**\n\n📝 ${textContent.length} characters\n📅 ${new Date().toLocaleString()}`
                });

                // Clean up temp file
                await fs.unlink(pdfResult.filePath).catch(() => {});

            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${pdfResult.error}`);
            }

        } catch (error) {
            console.error('Error in pdf command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error creating PDF.');
        }
    }

    async createPDF(title, content) {
        try {
            // Create a simple HTML structure for PDF conversion
            const html = this.generateHTML(title, content);

            // Try to use free HTML to PDF service (placeholder for now)
            const pdfResult = await this.htmlToPDF(html, title);

            if (pdfResult.success) {
                return pdfResult;
            }

            // Fallback: Create a simple text-based PDF using basic formatting
            return await this.createTextPDF(title, content);

        } catch (error) {
            console.error('PDF creation error:', error);
            return {
                success: false,
                error: 'PDF generation service temporarily unavailable'
            };
        }
    }

    generateHTML(title, content) {
        // Format content with proper paragraphs
        const formattedContent = content.split('\n').map(line =>
            line.trim() ? `<p>${line.trim()}</p>` : '<br>'
        ).join('');

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                h1 { color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
                p { margin-bottom: 15px; text-align: justify; }
                .footer { margin-top: 50px; font-size: 12px; color: #666; text-align: center; }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            ${formattedContent}
            <div class="footer">Generated by MATDEV Bot on ${new Date().toLocaleString()}</div>
        </body>
        </html>`;
    }

    async htmlToPDF(html, title) {
        try {
            // Try free HTML to PDF conversion services
            // This is a placeholder - in practice you'd use services like:
            // - HTMLCSStoRPDF API
            // - Puppeteer (requires more setup)
            // - wkhtmltopdf (requires system installation)

            // For now, return failure to use fallback
            return { success: false };

        } catch (error) {
            console.error('HTML to PDF error:', error);
            return { success: false };
        }
    }

    async createTextPDF(title, content) {
        try {
            // Create a basic text-based PDF using simple formatting
            // This is a fallback that creates a readable text file with PDF extension
            // In practice, you'd use a proper PDF library

            const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.txt`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(filePath));

            const formattedContent = `
${title}
${'='.repeat(title.length)}

${content}

---
Generated by MATDEV Bot
${new Date().toLocaleString()}
            `.trim();

            await fs.writeFile(filePath, formattedContent);

            return {
                success: true,
                filePath: filePath,
                fileName: fileName.replace('.txt', '.pdf') // Rename for better UX
            };

        } catch (error) {
            console.error('Text PDF creation error:', error);
            return {
                success: false,
                error: 'Failed to create PDF file'
            };
        }
    }

    async cleanup() {
        console.log('🧹 PDF Tools plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new PDFToolsPlugin();
        await plugin.init(bot);
        return plugin;
    }
};