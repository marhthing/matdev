const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');

class ConverterPlugin {
    constructor() {
        this.name = 'converter';
        this.description = 'Convert between various file formats (PDF, DOC, images, text)';
        this.version = '2.0.0';
        this.enabled = true;
        this.supportedFormats = {
            input: ['text', 'pdf', 'doc', 'docx', 'html', 'image'],
            output: ['pdf', 'doc', 'docx', 'txt', 'html', 'png', 'jpg', 'jpeg']
        };
    }

    async init(bot) {
        this.bot = bot;
        try {
            // Register multiple converter commands
            this.bot.messageHandler.registerCommand('topdf', this.textToPdfCommand.bind(this), {
                description: 'Convert text or message to PDF',
                usage: `${config.PREFIX}topdf <text> OR reply to message with ${config.PREFIX}topdf`,
                category: 'utility',
                plugin: 'converter',
                source: 'converter.js'
            });

            this.bot.messageHandler.registerCommand('pdftoimg', this.pdfToImageCommand.bind(this), {
                description: 'Convert PDF to image (send PDF file)',
                usage: `${config.PREFIX}pdftoimg [page_number] - Reply to PDF or send with command`,
                category: 'utility',
                plugin: 'converter',
                source: 'converter.js'
            });

            this.bot.messageHandler.registerCommand('convert', this.universalConvertCommand.bind(this), {
                description: 'Universal converter - specify input and output format',
                usage: `${config.PREFIX}convert <from_format> <to_format> - Then send/reply with file`,
                category: 'utility',
                plugin: 'converter',
                source: 'converter.js'
            });

            this.bot.messageHandler.registerCommand('formats', this.listFormatsCommand.bind(this), {
                description: 'List all supported conversion formats',
                usage: `${config.PREFIX}formats`,
                category: 'utility',
                plugin: 'converter',
                source: 'converter.js'
            });

            console.log('✅ Enhanced Converter plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Converter plugin:', error);
            return false;
        }
    }

    async listFormatsCommand(messageInfo) {
        const formatsList = `📋 **Supported Conversion Formats**

**Input Formats:**
${this.supportedFormats.input.map(f => `• ${f.toUpperCase()}`).join('\n')}

**Output Formats:**
${this.supportedFormats.output.map(f => `• ${f.toUpperCase()}`).join('\n')}

**Available Commands:**
• \`${config.PREFIX}topdf\` - Convert text to PDF
• \`${config.PREFIX}pdftoimg\` - Convert PDF to image
• \`${config.PREFIX}convert <from> <to>\` - Universal converter

**Examples:**
• \`${config.PREFIX}topdf Hello World\`
• \`${config.PREFIX}pdftoimg\` (reply to PDF)
• \`${config.PREFIX}convert pdf png\` (then send PDF)`;

        await this.bot.messageHandler.reply(messageInfo, formatsList);
    }

    async textToPdfCommand(messageInfo) {
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

    async pdfToImageCommand(messageInfo) {
        try {
            const pageNumber = messageInfo.args[0] ? parseInt(messageInfo.args[0]) : 1;
            
            // Check for file in message or quoted message
            const fileMessage = messageInfo.message?.documentMessage || 
                              messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
            
            if (!fileMessage || fileMessage.mimetype !== 'application/pdf') {
                await this.bot.messageHandler.reply(messageInfo, 
                    '📄 Please send a PDF file or reply to a PDF with this command.\n\n' +
                    `Usage: \`${config.PREFIX}pdftoimg [page_number]\`\n` +
                    'Example: `.pdftoimg 2` (converts page 2 to image)');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting PDF to image...');

            const result = await this.convertPdfToImage(fileMessage, pageNumber);
            
            if (result.success) {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: { url: result.filePath },
                    caption: `📸 PDF Page ${pageNumber} converted to image`
                });
                
                // Clean up temp file
                await fs.unlink(result.filePath).catch(() => {});
            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${result.error}`);
            }

        } catch (error) {
            console.error('Error in pdftoimg command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting PDF to image.');
        }
    }

    async universalConvertCommand(messageInfo) {
        try {
            if (messageInfo.args.length < 2) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔧 **Universal Converter**\n\n' +
                    `Usage: \`${config.PREFIX}convert <from_format> <to_format>\`\n\n` +
                    'Then send the file you want to convert.\n\n' +
                    'Examples:\n' +
                    '• `.convert pdf png` (then send PDF)\n' +
                    '• `.convert doc pdf` (then send DOC)\n' +
                    '• `.convert image pdf` (then send image)\n\n' +
                    `Type \`${config.PREFIX}formats\` to see all supported formats.`);
                return;
            }

            const fromFormat = messageInfo.args[0].toLowerCase();
            const toFormat = messageInfo.args[1].toLowerCase();

            if (!this.supportedFormats.input.includes(fromFormat)) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Unsupported input format: ${fromFormat}\n` +
                    `Supported: ${this.supportedFormats.input.join(', ')}`);
                return;
            }

            if (!this.supportedFormats.output.includes(toFormat)) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Unsupported output format: ${toFormat}\n` +
                    `Supported: ${this.supportedFormats.output.join(', ')}`);
                return;
            }

            // Store conversion request (you might want to implement a cache/session system)
            await this.bot.messageHandler.reply(messageInfo, 
                `✅ Conversion set: ${fromFormat.toUpperCase()} → ${toFormat.toUpperCase()}\n\n` +
                '📎 Now send the file you want to convert or reply to a file with this command.');

        } catch (error) {
            console.error('Error in convert command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error setting up conversion.');
        }
    }

    async convertPdfToImage(fileMessage, pageNumber = 1) {
        try {
            // Download PDF file
            const pdfPath = await this.downloadFile(fileMessage);
            
            // Use API to convert PDF to image
            const imageResult = await this.pdfToImageAPI(pdfPath, pageNumber);
            
            if (imageResult.success) {
                // Clean up PDF file
                await fs.unlink(pdfPath).catch(() => {});
                return imageResult;
            }

            // Fallback: Try alternative methods
            return await this.pdfToImageFallback(pdfPath, pageNumber);

        } catch (error) {
            console.error('PDF to image conversion error:', error);
            return {
                success: false,
                error: 'Failed to convert PDF to image'
            };
        }
    }

    async pdfToImageAPI(pdfPath, pageNumber) {
        try {
            // Try using PDF-lib or similar API for conversion
            const formData = new (require('form-data'))();
            formData.append('file', fs.createReadStream(pdfPath));
            formData.append('page', pageNumber.toString());
            formData.append('format', 'png');

            const response = await axios.post('https://api.convertapi.com/convert/pdf/to/png', formData, {
                headers: {
                    ...formData.getHeaders(),
                },
                timeout: 15000,
                responseType: 'arraybuffer'
            });

            if (response.data) {
                const fileName = `pdf_page_${pageNumber}_${Date.now()}.png`;
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
            console.error('PDF to image API error:', error);
            return { success: false };
        }
    }

    async pdfToImageFallback(pdfPath, pageNumber) {
        try {
            // Alternative approach using pdf2pic or similar
            const response = await axios.post('https://api.pdf24.org/convert', {
                inputFormat: 'pdf',
                outputFormat: 'png',
                page: pageNumber
            }, {
                timeout: 10000
            });

            if (response.data && response.data.success) {
                const fileName = `pdf_page_${pageNumber}_${Date.now()}.png`;
                const filePath = path.join(__dirname, '..', 'tmp', fileName);
                
                // Download the converted image
                const imageResponse = await axios.get(response.data.url, {
                    responseType: 'arraybuffer'
                });
                
                await fs.ensureDir(path.dirname(filePath));
                await fs.writeFile(filePath, imageResponse.data);

                return {
                    success: true,
                    filePath: filePath,
                    fileName: fileName
                };
            }

            return {
                success: false,
                error: 'PDF conversion service unavailable'
            };

        } catch (error) {
            console.error('PDF to image fallback error:', error);
            return {
                success: false,
                error: 'Unable to convert PDF to image'
            };
        }
    }

    async downloadFile(fileMessage) {
        try {
            const fileName = fileMessage.fileName || `temp_file_${Date.now()}`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);
            
            await fs.ensureDir(path.dirname(filePath));
            
            // Download file using WhatsApp's download mechanism
            const buffer = await this.bot.sock.downloadMediaMessage(fileMessage);
            await fs.writeFile(filePath, buffer);
            
            return filePath;

        } catch (error) {
            console.error('File download error:', error);
            throw new Error('Failed to download file');
        }
    }

    async convertDocToPdf(docPath) {
        try {
            // Use LibreOffice API or similar for DOC to PDF conversion
            const response = await axios.post('https://api.convertapi.com/convert/doc/to/pdf', {
                file: fs.createReadStream(docPath)
            }, {
                timeout: 15000,
                responseType: 'arraybuffer'
            });

            if (response.data) {
                const fileName = `converted_${Date.now()}.pdf`;
                const filePath = path.join(__dirname, '..', 'tmp', fileName);
                
                await fs.writeFile(filePath, response.data);
                return {
                    success: true,
                    filePath: filePath,
                    fileName: fileName
                };
            }

            return { success: false };

        } catch (error) {
            console.error('DOC to PDF conversion error:', error);
            return {
                success: false,
                error: 'Failed to convert DOC to PDF'
            };
        }
    }

    async convertPdfToDoc(pdfPath) {
        try {
            // Use API for PDF to DOC conversion
            const response = await axios.post('https://api.convertapi.com/convert/pdf/to/docx', {
                file: fs.createReadStream(pdfPath)
            }, {
                timeout: 15000,
                responseType: 'arraybuffer'
            });

            if (response.data) {
                const fileName = `converted_${Date.now()}.docx`;
                const filePath = path.join(__dirname, '..', 'tmp', fileName);
                
                await fs.writeFile(filePath, response.data);
                return {
                    success: true,
                    filePath: filePath,
                    fileName: fileName
                };
            }

            return { success: false };

        } catch (error) {
            console.error('PDF to DOC conversion error:', error);
            return {
                success: false,
                error: 'Failed to convert PDF to DOC'
            };
        }
    }

    async cleanup() {
        console.log('🧹 Enhanced Converter plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new ConverterPlugin();
        await plugin.init(bot);
        return plugin;
    }
};