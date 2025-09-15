/**
 * MATDEV Typography System
 * Provides different Unicode font families for menu styling
 */

class Typography {
    constructor() {
        // Unicode character maps for different font families
        this.charMaps = {
            // Sans-serif Bold (clean, modern)
            'sans-bold': {
                uppercase: {
                    'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝',
                    'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧',
                    'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭'
                },
                lowercase: {
                    'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷',
                    'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁',
                    'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇'
                },
                digits: {
                    '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
                }
            },

            // Sans-serif Bold Italic (dynamic, distinctive)
            'sans-bold-italic': {
                uppercase: {
                    'A': '𝘼', 'B': '𝘽', 'C': '𝘾', 'D': '𝘿', 'E': '𝙀', 'F': '𝙁', 'G': '𝙂', 'H': '𝙃', 'I': '𝙄', 'J': '𝙅',
                    'K': '𝙆', 'L': '𝙇', 'M': '𝙈', 'N': '𝙉', 'O': '𝙊', 'P': '𝙋', 'Q': '𝙌', 'R': '𝙍', 'S': '𝙎', 'T': '𝙏',
                    'U': '𝙐', 'V': '𝙑', 'W': '𝙒', 'X': '𝙓', 'Y': '𝙔', 'Z': '𝙕'
                },
                lowercase: {
                    'a': '𝙖', 'b': '𝙗', 'c': '𝙘', 'd': '𝙙', 'e': '𝙚', 'f': '𝙛', 'g': '𝙜', 'h': '𝙝', 'i': '𝙞', 'j': '𝙟',
                    'k': '𝙠', 'l': '𝙡', 'm': '𝙢', 'n': '𝙣', 'o': '𝙤', 'p': '𝙥', 'q': '𝙦', 'r': '𝙧', 's': '𝙨', 't': '𝙩',
                    'u': '𝙪', 'v': '𝙫', 'w': '𝙬', 'x': '𝙭', 'y': '𝙮', 'z': '𝙯'
                },
                digits: {
                    '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
                }
            },

            // Double-struck (strong, mathematical look)
            'double-struck': {
                uppercase: {
                    'A': '𝔸', 'B': '𝔹', 'C': 'ℂ', 'D': '𝔻', 'E': '𝔼', 'F': '𝔽', 'G': '𝔾', 'H': 'ℍ', 'I': '𝕀', 'J': '𝕁',
                    'K': '𝕂', 'L': '𝕃', 'M': '𝕄', 'N': 'ℕ', 'O': '𝕆', 'P': 'ℙ', 'Q': 'ℚ', 'R': 'ℝ', 'S': '𝕊', 'T': '𝕋',
                    'U': '𝕌', 'V': '𝕍', 'W': '𝕎', 'X': '𝕏', 'Y': '𝕐', 'Z': 'ℤ'
                },
                lowercase: {
                    'a': '𝕒', 'b': '𝕓', 'c': '𝕔', 'd': '𝕕', 'e': '𝕖', 'f': '𝕗', 'g': '𝕘', 'h': '𝕙', 'i': '𝕚', 'j': '𝕛',
                    'k': '𝕜', 'l': '𝕝', 'm': '𝕞', 'n': '𝕟', 'o': '𝕠', 'p': '𝕡', 'q': '𝕢', 'r': '𝕣', 's': '𝕤', 't': '𝕥',
                    'u': '𝕦', 'v': '𝕧', 'w': '𝕨', 'x': '𝕩', 'y': '𝕪', 'z': '𝕫'
                },
                digits: {
                    '0': '𝟘', '1': '𝟙', '2': '𝟚', '3': '𝟛', '4': '𝟜', '5': '𝟝', '6': '𝟞', '7': '𝟟', '8': '𝟠', '9': '𝟡'
                }
            },

            // Plain (fallback)
            'plain': {
                uppercase: {},
                lowercase: {},
                digits: {}
            }
        };

        // Theme definitions
        this.themes = {
            'neosans': {
                name: 'NeoSans',
                description: 'Modern sans-serif bold styling',
                headerSet: 'sans-bold',
                categorySet: 'sans-bold',
                commandSet: 'sans-bold',
                bullet: '▸',
                bracketLeft: '⟦',
                bracketRight: '⟧',
                sectionLine: '┈',
                categoryPrefix: '',
                categorySuffix: ''
            },
            'aeroitalic': {
                name: 'AeroItalic', 
                description: 'Dynamic italic sans-serif styling',
                headerSet: 'sans-bold-italic',
                categorySet: 'sans-bold-italic',
                commandSet: 'sans-bold-italic',
                bullet: '‣',
                bracketLeft: '❰',
                bracketRight: '❱',
                sectionLine: '—',
                categoryPrefix: '— ',
                categorySuffix: ' —'
            },
            'doublestrike': {
                name: 'DoubleStrike',
                description: 'Strong mathematical double-struck styling',
                headerSet: 'double-struck',
                categorySet: 'plain',
                commandSet: 'double-struck',
                bullet: '▹',
                bracketLeft: '⟪',
                bracketRight: '⟫',
                sectionLine: '┄',
                categoryPrefix: '[ ',
                categorySuffix: ' ]'
            }
        };

        this.defaultTheme = 'neosans';
    }

    /**
     * Transform text using specified font set
     */
    transform(text, fontSet) {
        if (!text || fontSet === 'plain') return text;

        const charMap = this.charMaps[fontSet];
        if (!charMap) return text;

        return text.split('').map(char => {
            return charMap.uppercase[char] || 
                   charMap.lowercase[char] || 
                   charMap.digits[char] || 
                   char;
        }).join('');
    }

    /**
     * Get theme configuration
     */
    getTheme(themeName) {
        return this.themes[themeName] || this.themes[this.defaultTheme];
    }

    /**
     * Get available themes
     */
    getAvailableThemes() {
        return Object.keys(this.themes);
    }

    /**
     * Format header with theme
     */
    formatHeader(text, theme) {
        const transformedText = this.transform(text, theme.headerSet);
        return `${theme.bracketLeft} ${transformedText} ${theme.bracketRight}`;
    }

    /**
     * Format category with theme
     */
    formatCategory(text, theme) {
        const transformedText = this.transform(text, theme.categorySet);
        return `${theme.categoryPrefix}${transformedText}${theme.categorySuffix}`;
    }

    /**
     * Format command with theme
     */
    formatCommand(text, theme) {
        const transformedText = this.transform(text, theme.commandSet);
        return `${theme.bullet} ${transformedText}`;
    }
}

module.exports = Typography;