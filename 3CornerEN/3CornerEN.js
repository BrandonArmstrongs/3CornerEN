// ------------------------ DOWNLOAD ------------------------
document.getElementById('downloadBtn').addEventListener('click', () => {
  const output = document.getElementById('outputString').value;
  const filenameInput = document.getElementById('filename').value.trim() || 'file';
  const filename = filenameInput + '.3CEN';
  const blob = new Blob([output], {type: 'text/plain'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
});

// ------------------------ IMPORT ------------------------
document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    document.getElementById('inputString').value = ev.target.result;
  };
  reader.readAsText(file);
});

// ------------------------ HELPERS ------------------------
function stringToHex(str) {
  let hex = '';
  for (let i = 0; i < str.length; i++) hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  return hex;
}

function hexToString(hex) {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  return str;
}

function base36ToHex(base36Str) {
  let result = BigInt(0);
  const base = BigInt(36);
  for (let i = 0; i < base36Str.length; i++) {
    let digit = parseInt(base36Str[i], 36);
    if (isNaN(digit)) throw new Error('Invalid base36 digit: ' + base36Str[i]);
    result = result * base + BigInt(digit);
  }
  let hex = result.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  return hex;
}

function stringToBytes(str) {
  let bytes = [];
  for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
  return bytes;
}

function bytesToString(bytes) {
  return String.fromCharCode(...bytes);
}

function modInverse256(a) {
  let m = 256, m0 = m, y = 0, x = 1;
  if (m === 1) return 0;
  while (a > 1) {
    let q = Math.floor(a / m);
    let t = m;
    m = a % m;
    a = t;
    t = y;
    y = x - q * y;
    x = t;
  }
  if (x < 0) x += m0;
  return x;
}

// ------------------------ KEY VALIDATION ------------------------
function validateKey(key) {
  if (!/^\d{9}$/.test(key)) return false;
  const firstThree = key.slice(0,3).split('').map(Number).sort().join('');
  if (firstThree !== '123') return false;
  const nums = [key.slice(3,5), key.slice(5,7), key.slice(7,9)].map(Number);
  return nums.every(n => n >= 10 && n <= 80);
}

// ------------------------ ENCODER ------------------------
function encodeStringWithKey(str, key) {
  if (!str) return '';
  const digits = key.split('').map(d => parseInt(d));

  str = 'e' + str;
  let chars = Array.from(str);
  let parts = [];
  let i = 0;
  while (i < chars.length) {
    let count = 0;
    while (i + count + 1 < chars.length && chars[i] === chars[i + count + 1] && count < 89) count++;
    let code36 = chars[i].charCodeAt(0).toString(36);
    parts.push(code36.length.toString(36) + code36);
    if (count > 0) parts.push((10 + count).toString(36));
    i += count + 1;
  }
  let rawStr = parts.join('');
  let bytes = stringToBytes(rawStr);

  for (let idx = 0; idx < bytes.length; idx++) {
    bytes[idx] = bytes[idx] ^ digits[idx % 9];
    let mul = (digits[(idx + 7) % 9] * 2 + 1) % 256;
    if (mul === 0) mul = 1;
    bytes[idx] = (bytes[idx] * mul) % 256;
    bytes[idx] = (bytes[idx] + digits[(idx + 5) % 9] * 5) % 256;
    bytes[idx] = (bytes[idx] - digits[(idx + 3) % 9] * 7 + 256) % 256;
  }
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  let bigIntVal = BigInt('0x' + hex);
  return bigIntVal.toString(36);
}

// ------------------------ DECODER ------------------------
function decodeStringWithKey(encodedStr, key) {
  if (!encodedStr) return '';
  const digits = key.split('').map(d => parseInt(d));
  try {
    let hexStr = base36ToHex(encodedStr);
    let bytes = stringToBytes(hexToString(hexStr));
    for (let idx = 0; idx < bytes.length; idx++) {
      bytes[idx] = (bytes[idx] + digits[(idx + 3) % 9] * 7) % 256;
      bytes[idx] = (bytes[idx] - digits[(idx + 5) % 9] * 5 + 256) % 256;
      let mul = (digits[(idx + 7) % 9] * 2 + 1) % 256;
      if (mul === 0) mul = 1;
      let inv = modInverse256(mul);
      if (inv === 0) throw new Error('No modular inverse for multiplier ' + mul);
      bytes[idx] = (bytes[idx] * inv) % 256;
      bytes[idx] = bytes[idx] ^ digits[idx % 9];
    }
    let rawStr = bytesToString(bytes);
    let decoded = '';
    let i = 0;
    while (i < rawStr.length) {
      let len = parseInt(rawStr[i], 36);
      if (isNaN(len) || len <= 0) throw new Error('Invalid length during decode');
      i++;
      let codeStr = rawStr.slice(i, i + len);
      let code = parseInt(codeStr, 36);
      if (isNaN(code)) throw new Error('Invalid char code during decode');
      i += len;
      let repeatCount = 0;
      if (i < rawStr.length) {
        let repeatDigit = parseInt(rawStr[i], 36);
        if (!isNaN(repeatDigit) && repeatDigit >= 10 && repeatDigit <= 99) {
          repeatCount = repeatDigit - 10;
          i++;
        }
      }
      for (let r = 0; r <= repeatCount; r++) decoded += String.fromCharCode(code);
    }
    if (decoded[0] === 'e') decoded = decoded.slice(1);
    return decoded;
  } catch (e) {
    console.log('Decode error:', e);
    const printableChars = [];
    for (let c = 32; c <= 126; c++) printableChars.push(String.fromCharCode(c));
    let gibberish = '';
    for (let i = 0; i < encodedStr.length; i++) {
      gibberish += printableChars[Math.floor(Math.random() * printableChars.length)];
    }
    return gibberish;
  }
}

// ------------------------ KEY GENERATOR ------------------------
function generateRandomKey() {
  const arr = [1,2,3];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const nums = [];
  for (let i = 0; i < 3; i++) nums.push(String(Math.floor(Math.random() * 71 + 10)).padStart(2,'0'));
  return arr.join('') + nums.join('');
}

// ------------------------ BUTTON HANDLERS ------------------------
function handleEncodeDecode(action) {
  const input = document.getElementById('inputString').value;
  const key = document.getElementById('key').value;
  if (!validateKey(key)) {
    alert('Invalid key! Key must be 9 digits: 3-digit permutation of 1,2,3 followed by 3 numbers 10-80.');
    return;
  }
  const output = action === 'encode' ? encodeStringWithKey(input, key) : decodeStringWithKey(input, key);
  document.getElementById('outputString').value = output;
}

document.getElementById('encodeBtn').addEventListener('click', () => handleEncodeDecode('encode'));
document.getElementById('decodeBtn').addEventListener('click', () => handleEncodeDecode('decode'));
document.getElementById('generateKeyBtn').addEventListener('click', () => {
  document.getElementById('key').value = generateRandomKey();
});
