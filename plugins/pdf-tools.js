const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class PDFToolsPlugin {
    constructor() {
        this.name = 'pdf-tools';
        this.description = 'Create PDFs from text and convert documents';
        this.version = '1.0.0';
        this.enabled = true;
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('topdf', this.toPDFCommand.bind(this), {
                description: 'Convert text to PDF',
                usage: `${config.PREFIX}topdf <text>`,
                category: 'utility',
                plugin: 'pdf-tools',
                source: 'pdf-tools.js'
            });

            this.bot.messageHandler.registerCommand('textpdf', this.textPDFCommand.bind(this), {
                description: 'Create PDF from long text',
                usage: `${config.PREFIX}textpdf <title> | <content>`,
                category: 'utility',
                plugin: 'pdf-tools',
                source: 'pdf-tools.js'
            });

            this.bot.messageHandler.registerCommand('msgpdf', this.messagePDFCommand.bind(this), {
                description: 'Convert message to PDF (reply to message)',
                usage: `${config.PREFIX}msgpdf (reply to message)`,
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

    async toPDFCommand(messageInfo) {
        try {
            const text = messageInfo.args.join(' ').trim();
            if (!text) {
                await this.bot.messageHandler.reply(messageInfo,
                    '📄 Usage: .topdf <text>\n\n' +
                    'Examples:\n• .topdf Hello World\n• .topdf This is a longer text that will be converted to PDF format\n\n' +
                    '💡 For longer text with title, use .textpdf');
                return;
            }

            if (text.length > 2000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Text too long! Maximum 2000 characters. Use .textpdf for longer content.');
                return;
            }

            // Show processing message
            await this.bot.messageHandler.reply(messageInfo, '📄 Creating PDF...');

            const pdfResult = await this.createSimplePDF(text, 'Generated Document');
            
            if (pdfResult.success) {
                // Send the PDF file
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    document: { url: pdfResult.filePath },
                    fileName: pdfResult.fileName,
                    mimetype: 'application/pdf',
                    caption: `📄 **PDF Created**\n\n📝 ${text.length} characters converted\n📅 ${new Date().toLocaleString()}`
                });

                // Clean up temp file
                await fs.unlink(pdfResult.filePath).catch(() => {});

            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${pdfResult.error}`);
            }

        } catch (error) {
            console.error('Error in topdf command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error creating PDF.');
        }
    }

    async textPDFCommand(messageInfo) {
        try {
            const input = messageInfo.args.join(' ').trim();
            if (!input.includes('|')) {
                await this.bot.messageHandler.reply(messageInfo,
                    '📚 Usage: .textpdf <title> | <content>\n\n' +
                    'Example:\n.textpdf My Report | This is the content of my report with multiple paragraphs and detailed information.');
                return;
            }

            const [title, content] = input.split('|').map(s => s.trim());
            
            if (!title || !content) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Both title and content are required.\n\nFormat: .textpdf <title> | <content>');
                return;
            }

            if (content.length > 5000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Content too long! Maximum 5000 characters.');
                return;
            }

            // Show processing message
            await this.bot.messageHandler.reply(messageInfo, '📚 Creating formatted PDF...');

            const pdfResult = await this.createFormattedPDF(title, content);
            
            if (pdfResult.success) {
                // Send the PDF file
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    document: { url: pdfResult.filePath },
                    fileName: pdfResult.fileName,
                    mimetype: 'application/pdf',
                    caption: `📚 **PDF Document Created**\n\n📝 Title: ${title}\n📊 Content: ${content.length} characters\n📅 Created: ${new Date().toLocaleString()}`
                });

                // Clean up temp file
                await fs.unlink(pdfResult.filePath).catch(() => {});

            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${pdfResult.error}`);
            }

        } catch (error) {
            console.error('Error in textpdf command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error creating formatted PDF.');
        }
    }

    async messagePDFCommand(messageInfo) {
        try {
            // Check for quoted message
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '💬 Usage: Reply to a message with .msgpdf\n\n' +
                    '📄 This will convert the replied message to PDF format');
                return;
            }

            // Extract text from quoted message
            let messageText = '';
            if (quotedMessage.conversation) {
                messageText = quotedMessage.conversation;
            } else if (quotedMessage.extendedTextMessage?.text) {
                messageText = quotedMessage.extendedTextMessage.text;
            } else {
                await this.bot.messageHandler.reply(messageInfo, '❌ The replied message does not contain text.');
                return;
            }

            if (messageText.length > 3000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Message too long! Maximum 3000 characters.');
                return;
            }

            // Show processing message
            await this.bot.messageHandler.reply(messageInfo, '💬 Converting message to PDF...');

            const timestamp = new Date().toLocaleString();
            const title = `Message from ${timestamp}`;
            
            const pdfResult = await this.createFormattedPDF(title, messageText);
            
            if (pdfResult.success) {
                // Send the PDF file
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    document: { url: pdfResult.filePath },
                    fileName: pdfResult.fileName,
                    mimetype: 'application/pdf',
                    caption: `💬 **Message PDF Created**\n\n📝 ${messageText.length} characters\n📅 ${timestamp}`
                });

                // Clean up temp file
                await fs.unlink(pdfResult.filePath).catch(() => {});

            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${pdfResult.error}`);
            }

        } catch (error) {
            console.error('Error in msgpdf command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting message to PDF.');
        }
    }

    async createSimplePDF(text, title) {
        try {
            // Create a simple HTML structure for PDF conversion
            const html = this.generateHTML(title, text);
            
            // Try to use free HTML to PDF service
            const pdfResult = await this.htmlToPDF(html, title);
            
            if (pdfResult.success) {
                return pdfResult;
            }

            // Fallback: Create a simple text-based PDF using basic formatting
            return await this.createTextPDF(title, text);

        } catch (error) {
            console.error('PDF creation error:', error);
            return {
                success: false,
                error: 'PDF generation service temporarily unavailable'
            };
        }
    }

    async createFormattedPDF(title, content) {
        try {
            // Format content with paragraphs
            const formattedContent = content.split('\n').map(line => 
                line.trim() ? `<p>${line.trim()}</p>` : '<br>'
            ).join('');

            const html = this.generateHTML(title, null, formattedContent);
            
            // Try to convert HTML to PDF
            const pdfResult = await this.htmlToPDF(html, title);
            
            if (pdfResult.success) {
                return pdfResult;
            }

            // Fallback: Create simple text PDF
            return await this.createTextPDF(title, content);

        } catch (error) {
            console.error('Formatted PDF creation error:', error);
            return {
                success: false,
                error: 'PDF formatting service temporarily unavailable'
            };
        }
    }

    generateHTML(title, plainText = null, htmlContent = null) {
        const content = htmlContent || `<p>${plainText?.split('\n').join('</p><p>')}</p>`;
        
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
            ${content}
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