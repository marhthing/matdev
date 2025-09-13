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

            const pdfResult = await this.createPDF(title, textContent);

            if (pdfResult.success) {
                // Send the PDF file
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    document: { url: pdfResult.filePath },
                    fileName: pdfResult.fileName,
                    mimetype: 'application/pdf'
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
            // Try HTML-PDF conversion API
            const response = await axios.post('https://api.html-pdf-api.com/v1/generate', {
                html: html,
                options: {
                    format: 'A4',
                    margin: {
                        top: '1in',
                        bottom: '1in',
                        left: '0.5in',
                        right: '0.5in'
                    }
                }
            }, {
                timeout: 10000,
                responseType: 'arraybuffer',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data) {
                const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
                const filePath = path.join(__dirname, '..', 'tmp', fileName);

                await fs.ensureDir(path.dirname(filePath));
                await fs.writeFile(filePath, response.data);

                return {
                    success: true,
                    filePath: filePath,
                    fileName: fileName
                };
            }

            return { success: false };

        } catch (error) {
            console.error('HTML to PDF error:', error);
            // Try alternative API
            return await this.tryAlternativePDFAPI(html, title);
        }
    }

    async tryAlternativePDFAPI(html, title) {
        try {
            // Try a different PDF generation approach using PDFShift API
            const response = await axios.post('https://api.pdfshift.io/v3/convert/pdf', {
                source: html,
                landscape: false,
                format: 'A4'
            }, {
                timeout: 10000,
                responseType: 'arraybuffer',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from('api:').toString('base64'),
                    'Content-Type': 'application/json'
                }
            });

            if (response.data) {
                const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
                const filePath = path.join(__dirname, '..', 'tmp', fileName);

                await fs.ensureDir(path.dirname(filePath));
                await fs.writeFile(filePath, response.data);

                return {
                    success: true,
                    filePath: filePath,
                    fileName: fileName
                };
            }

            return { success: false };

        } catch (error) {
            console.error('Alternative PDF API error:', error);
            return { success: false };
        }
    }

    async createTextPDF(title, content) {
        try {
            // Create a simple PDF using a basic PDF structure
            const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(filePath));

            // Try to use a simple HTML to PDF approach with basic CSS
            const simplePDFHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page { margin: 2cm; }
        body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; }
        h1 { font-size: 18pt; margin-bottom: 20px; text-align: center; }
        .content { text-align: justify; margin-bottom: 30px; }
        .footer { font-size: 10pt; color: #666; text-align: center; position: fixed; bottom: 1cm; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="content">${content.replace(/\n/g, '<br>')}</div>
    <div class="footer">Generated by MATDEV Bot - ${new Date().toLocaleString()}</div>
</body>
</html>`;

            // Try one more lightweight conversion approach
            try {
                const pdfResponse = await axios.post('https://htmlpdfapi.com/api/v1/pdf', {
                    html: simplePDFHTML,
                    options: { format: 'A4', margin: '1cm' }
                }, {
                    timeout: 8000,
                    responseType: 'arraybuffer',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (pdfResponse.data) {
                    await fs.writeFile(filePath, pdfResponse.data);
                    return {
                        success: true,
                        filePath: filePath,
                        fileName: fileName
                    };
                }
            } catch (e) {
                }

            // Ultimate fallback: Create a real PDF using PDFKit
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({
                margin: 50,
                font: 'Helvetica'
            });
            
            // Create write stream
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);
            
            // Add title
            doc.fontSize(20)
               .fillColor('#333333')
               .text(title, 50, 50);
            
            // Add underline
            doc.moveTo(50, 80)
               .lineTo(550, 80)
               .strokeColor('#007acc')
               .lineWidth(2)
               .stroke();
            
            // Add content
            doc.fontSize(12)
               .fillColor('#000000')
               .text(content, 50, 110, {
                   width: 500,
                   align: 'justify',
                   lineGap: 5
               });
            
            // Add footer
            const pageHeight = doc.page.height;
            doc.fontSize(10)
               .fillColor('#666666')
               .text(`Generated by MATDEV Bot on ${new Date().toLocaleString()}`, 50, pageHeight - 50, {
                   align: 'center'
               });
            
            // Finalize the PDF
            doc.end();
            
            // Wait for the stream to finish
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });
            
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('Text PDF creation error:', error);
            return {
                success: false,
                error: 'Failed to create document file'
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