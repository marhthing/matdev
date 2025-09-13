const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
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

            // Convert to PDF using JavaScript-based conversion
            const outputFileName = `${originalFileName}.pdf`;
            const outputFilePath = path.join(tempDir, outputFileName);

            // Handle different file types
            if (mediaInfo.type === 'image') {
                // Convert image to PDF using JavaScript
                return await this.convertImageToPDF(fileUrl, outputFilePath, outputFileName);
            } else if (mediaInfo.type === 'document') {
                // Handle document conversion
                if (mimeType === 'application/pdf') {
                    // If it's already a PDF, just save it
                    await fs.writeFile(outputFilePath, fileUrl);
                    return {
                        success: true,
                        filePath: outputFilePath,
                        fileName: outputFileName
                    };
                } else {
                    // For other document types, convert using online service
                    return await this.convertDocumentToPDF(fileUrl, mimeType, outputFilePath, outputFileName);
                }
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

    async convertImageToPDF(imageBuffer, outputPath, fileName) {
        try {
            const PDFDocument = require('pdfkit');
            const sizeOf = require('image-size');
            
            // Get image dimensions
            const dimensions = sizeOf(imageBuffer);
            
            // Create PDF document
            const doc = new PDFDocument({
                margin: 40,
                size: [dimensions.width + 80, dimensions.height + 80]
            });

            // Create write stream
            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            // Add image to PDF
            doc.image(imageBuffer, 40, 40, {
                width: dimensions.width,
                height: dimensions.height
            });

            doc.end();

            // Wait for completion
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            return {
                success: true,
                filePath: outputPath,
                fileName: fileName
            };

        } catch (error) {
            console.error('Image to PDF conversion error:', error);
            return { success: false, error: 'Failed to convert image to PDF.' };
        }
    }

    async convertDocumentToPDF(docBuffer, mimeType, outputPath, fileName) {
        try {
            // Try online conversion services for documents
            const convertedBuffer = await this.tryOnlineDocumentConversion(docBuffer, mimeType);
            
            if (convertedBuffer) {
                await fs.writeFile(outputPath, convertedBuffer);
                return {
                    success: true,
                    filePath: outputPath,
                    fileName: fileName
                };
            } else {
                // Fallback: create a text-based PDF with document info
                return await this.createDocumentInfoPDF(outputPath, fileName, mimeType);
            }

        } catch (error) {
            console.error('Document to PDF conversion error:', error);
            return { success: false, error: 'Failed to convert document to PDF.' };
        }
    }

    async tryOnlineDocumentConversion(docBuffer, mimeType) {
        try {
            // Try ConvertAPI (free tier available)
            const formData = new FormData();
            formData.append('File', docBuffer, 'document');
            formData.append('StoreFile', 'true');

            const response = await axios.post('https://v2.convertapi.com/convert/doc/to/pdf', formData, {
                headers: {
                    'Authorization': 'Bearer demo', // Demo key - limited usage
                    ...formData.getHeaders()
                },
                timeout: 15000,
                responseType: 'arraybuffer'
            });

            return response.data;

        } catch (error) {
            console.log('Online conversion failed, using fallback method');
            return null;
        }
    }

    async createDocumentInfoPDF(outputPath, fileName, mimeType) {
        try {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50 });

            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            // Add document info
            doc.fontSize(20)
               .fillColor('#333333')
               .text('Document Conversion Notice', 50, 50);

            doc.moveTo(50, 80)
               .lineTo(550, 80)
               .strokeColor('#007acc')
               .lineWidth(2)
               .stroke();

            doc.fontSize(12)
               .fillColor('#000000')
               .text(`Original document type: ${mimeType}`, 50, 110)
               .text(`Conversion date: ${new Date().toLocaleString()}`, 50, 130)
               .text('\nThis document was converted from a non-text format.', 50, 160)
               .text('For full document content, please view the original file.', 50, 180);

            doc.fontSize(10)
               .fillColor('#666666')
               .text('Generated by MATDEV Bot', 50, doc.page.height - 50, { align: 'center' });

            doc.end();

            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            return {
                success: true,
                filePath: outputPath,
                fileName: fileName
            };

        } catch (error) {
            console.error('Document info PDF creation error:', error);
            return { success: false, error: 'Failed to create document information PDF.' };
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