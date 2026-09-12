/**
 * js-sha256 v0.9.0
 * https://github.com/emn178/js-sha256
 */
var hexChars = '0123456789abcdef'.split('');
var extra = [-2147483648, 8388608, 32768, 128];
var shift = [24, 16, 8, 0];
var K = [1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580, 3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986, 2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895, 666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037, 2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344, 430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779, 1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298];
var blocks = [];

export function sha256(message) {
    if (typeof message !== 'string') {
        message = String(message);
    }
    
    var h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
    var h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
    var block, code, i, j, b;
    var start = 0, bytes = 0, length = message.length;
    var W = blocks;

    for (i = 0; i < length; ) {
        code = message.charCodeAt(i++);
        if (code < 0x80) {
            W[start >> 2] |= code << shift[start++ & 3];
        } else if (code < 0x800) {
            W[start >> 2] |= (0xc0 | (code >> 6)) << shift[start++ & 3];
            W[start >> 2] |= (0x80 | (code & 0x3f)) << shift[start++ & 3];
        } else if (code < 0xd800 || code >= 0xe000) {
            W[start >> 2] |= (0xe0 | (code >> 12)) << shift[start++ & 3];
            W[start >> 2] |= (0x80 | ((code >> 6) & 0x3f)) << shift[start++ & 3];
            W[start >> 2] |= (0x80 | (code & 0x3f)) << shift[start++ & 3];
        } else {
            code = 0x10000 + (((code & 0x3ff) << 10) | (message.charCodeAt(i++) & 0x3ff));
            W[start >> 2] |= (0xf0 | (code >> 18)) << shift[start++ & 3];
            W[start >> 2] |= (0x80 | ((code >> 12) & 0x3f)) << shift[start++ & 3];
            W[start >> 2] |= (0x80 | ((code >> 6) & 0x3f)) << shift[start++ & 3];
            W[start >> 2] |= (0x80 | (code & 0x3f)) << shift[start++ & 3];
        }
        
        if (start >= 64) {
            var a = h0, b_val = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
            for (j = 0; j < 64; ++j) {
                if (j >= 16) {
                    var s0 = (W[j - 15] >>> 7 | W[j - 15] << 25) ^ (W[j - 15] >>> 18 | W[j - 15] << 14) ^ (W[j - 15] >>> 3);
                    var s1 = (W[j - 2] >>> 17 | W[j - 2] << 15) ^ (W[j - 2] >>> 19 | W[j - 2] << 13) ^ (W[j - 2] >>> 10);
                    W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
                }
                var S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
                var ch = (e & f) ^ (~e & g);
                var temp1 = (h + S1 + ch + K[j] + W[j]) | 0;
                var S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
                var maj = (a & b_val) ^ (a & c) ^ (b_val & c);
                var temp2 = (S0 + maj) | 0;

                h = g; g = f; f = e;
                e = (d + temp1) | 0;
                d = c; c = b_val; b_val = a;
                a = (temp1 + temp2) | 0;
            }
            h0 = (h0 + a) | 0; h1 = (h1 + b_val) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
            h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
            
            start = 0;
            for (j = 0; j < 16; ++j) W[j] = 0;
        }
        bytes++;
    }
    
    var lastByteIndex = start;
    W[lastByteIndex >> 2] |= extra[lastByteIndex & 3];
    
    if (start >= 56) {
        var a = h0, b_val = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (j = 0; j < 64; ++j) {
            if (j >= 16) {
                var s0 = (W[j - 15] >>> 7 | W[j - 15] << 25) ^ (W[j - 15] >>> 18 | W[j - 15] << 14) ^ (W[j - 15] >>> 3);
                var s1 = (W[j - 2] >>> 17 | W[j - 2] << 15) ^ (W[j - 2] >>> 19 | W[j - 2] << 13) ^ (W[j - 2] >>> 10);
                W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
            }
            var S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
            var ch = (e & f) ^ (~e & g);
            var temp1 = (h + S1 + ch + K[j] + W[j]) | 0;
            var S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
            var maj = (a & b_val) ^ (a & c) ^ (b_val & c);
            var temp2 = (S0 + maj) | 0;

            h = g; g = f; f = e;
            e = (d + temp1) | 0;
            d = c; c = b_val; b_val = a;
            a = (temp1 + temp2) | 0;
        }
        h0 = (h0 + a) | 0; h1 = (h1 + b_val) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
        for (j = 0; j < 16; ++j) W[j] = 0;
    }
    
    W[14] = (bytes * 8) / 0x100000000 | 0;
    W[15] = (bytes * 8) & 0xffffffff;
    
    var a = h0, b_val = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (j = 0; j < 64; ++j) {
        if (j >= 16) {
            var s0 = (W[j - 15] >>> 7 | W[j - 15] << 25) ^ (W[j - 15] >>> 18 | W[j - 15] << 14) ^ (W[j - 15] >>> 3);
            var s1 = (W[j - 2] >>> 17 | W[j - 2] << 15) ^ (W[j - 2] >>> 19 | W[j - 2] << 13) ^ (W[j - 2] >>> 10);
            W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
        }
        var S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K[j] + W[j]) | 0;
        var S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
        var maj = (a & b_val) ^ (a & c) ^ (b_val & c);
        var temp2 = (S0 + maj) | 0;

        h = g; g = f; f = e;
        e = (d + temp1) | 0;
        d = c; c = b_val; b_val = a;
        a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b_val) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    
    for (j = 0; j < 16; ++j) W[j] = 0;
    
    var res = '';
    var H = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (i = 0; i < 8; ++i) {
        for (j = 28; j >= 0; j -= 4) {
            res += hexChars[(H[i] >> j) & 0x0f];
        }
    }
    return res;
}
