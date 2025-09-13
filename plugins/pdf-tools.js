const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const { exec } = require('child_process'); // Required for LibreOffice conversion
const { downloadMediaMessage } = require('@whiskeysockets/baileys'); // Import downloadMediaMessage

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
                description: 'Convert text, images, or documents to PDF',
                usage: `${config.PREFIX}pdf <text> OR reply to message/image/document with ${config.PREFIX}pdf`,
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
            // Check for quoted/tagged message first
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            // Check if the message itself has media
            let currentMedia = null;
            if (messageInfo.message?.imageMessage) {
                currentMedia = { type: 'image', data: messageInfo.message.imageMessage };
            } else if (messageInfo.message?.documentMessage) {
                currentMedia = { type: 'document', data: messageInfo.message.documentMessage };
            }

            let textContent = '';
            let title = '';
            let mediaToProcess = null;

            if (quotedMessage) {
                // Check for media in quoted message first
                if (quotedMessage.imageMessage) {
                    mediaToProcess = { type: 'image', data: quotedMessage.imageMessage, isQuoted: true };
                    title = `Image from ${new Date().toLocaleDateString()}`;
                } else if (quotedMessage.documentMessage) {
                    mediaToProcess = { type: 'document', data: quotedMessage.documentMessage, isQuoted: true };
                    title = `Document from ${new Date().toLocaleDateString()}`;
                } else if (quotedMessage.conversation) {
                    textContent = quotedMessage.conversation;
                    title = `Message from ${new Date().toLocaleString()}`;
                } else if (quotedMessage.extendedTextMessage?.text) {
                    textContent = quotedMessage.extendedTextMessage.text;
                    title = `Message from ${new Date().toLocaleString()}`;
                } else {
                    await this.bot.messageHandler.reply(messageInfo, '❌ The replied message does not contain text, image, or document.');
                    return;
                }
            } else if (currentMedia) {
                // Use current media
                mediaToProcess = currentMedia;
                title = `Media from ${new Date().toLocaleDateString()}`;
            } else {
                // Get text from command arguments
                textContent = messageInfo.args.join(' ').trim();
                if (!textContent) {
                    await this.bot.messageHandler.reply(messageInfo,
                        '📄 Usage: `.pdf <text>` OR reply to a message/image/document with `.pdf`\n\n' +
                        'Examples:\n• `.pdf Hello World`\n• Reply to any message/image/document and type `.pdf`\n• Send `.pdf` as caption on image/document\n\n' +
                        '📸 Supported: Images (JPG, PNG, WebP)\n📄 Supported: Documents (PDF, DOC, DOCX, TXT)');
                    return;
                }
                title = 'Generated Document';
            }

            // Process based on content type
            let pdfResult;

            if (mediaToProcess) {
                pdfResult = await this.processMediaToPDF(messageInfo, mediaToProcess, title);
            } else {
                // Check text length
                if (textContent.length > 5000) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Text too long! Maximum 5000 characters.');
                    return;
                }
                pdfResult = await this.createPDF(title, textContent);
            }

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

    async processMediaToPDF(messageInfo, mediaInfo, title) {
        const tempDir = path.join(__dirname, '..', 'tmp');
        await fs.ensureDir(tempDir);

        const originalFileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
        const originalFilePath = path.join(tempDir, originalFileName);

        try {
            let fileUrl = null;
            let mimeType = '';

            if (mediaInfo.type === 'image') {
                // Create proper message structure for download
                if (mediaInfo.isQuoted) {
                    const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                        messageInfo.message?.quotedMessage;
                    const messageToDownload = { message: quotedMessage };
                    fileUrl = await downloadMediaMessage(messageToDownload, 'buffer', {});
                } else {
                    fileUrl = await downloadMediaMessage(messageInfo, 'buffer', {});
                }
                mimeType = mediaInfo.data.mimetype;
            } else if (mediaInfo.type === 'document') {
                // Create proper message structure for download
                if (mediaInfo.isQuoted) {
                    const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                        messageInfo.message?.quotedMessage;
                    const messageToDownload = { message: quotedMessage };
                    fileUrl = await downloadMediaMessage(messageToDownload, 'buffer', {});
                } else {
                    fileUrl = await downloadMediaMessage(messageInfo, 'buffer', {});
                }
                mimeType = mediaInfo.data.mimetype;
            }

            if (!fileUrl) {
                return { success: false, error: 'Could not download media.' };
            }

            // Save the downloaded media to a temporary file
            await fs.writeFile(originalFilePath, fileUrl);

            // Convert to PDF using LibreOffice
            const outputFileName = `${originalFileName}.pdf`;
            const outputFilePath = path.join(tempDir, outputFileName);

            // Check if LibreOffice is installed and available
            try {
                await new Promise((resolve, reject) => {
                    exec(`soffice --headless --convert-to pdf --outdir "${tempDir}" "${originalFilePath}"`, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`LibreOffice conversion error: ${stderr}`);
                            reject(new Error('LibreOffice conversion failed.'));
                        } else {
                            resolve();
                        }
                    });
                });

                // Check if the output file was created
                if (fs.existsSync(outputFilePath)) {
                    return {
                        success: true,
                        filePath: outputFilePath,
                        fileName: outputFileName
                    };
                } else {
                    return { success: false, error: 'PDF conversion failed. Output file not found.' };
                }
            } catch (error) {
                console.error('LibreOffice execution error:', error);
                return { success: false, error: 'Error during PDF conversion. Ensure LibreOffice is installed and in your PATH.' };
            }

        } catch (error) {
            console.error('Error processing media for PDF:', error);
            return { success: false, error: 'Failed to process media for PDF conversion.' };
        } finally {
            // Clean up the original downloaded file
            await fs.unlink(originalFilePath).catch(() => {});
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