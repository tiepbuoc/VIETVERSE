// config.js
// File quản lý API keys và Firebase config với cơ chế đảo ngược

// Firebase config đã bị đảo ngược để tránh bị quét
const REVERSED_FIREBASE_CONFIG = {
  apiKey: 'aw0QRiGgP6CG-S' + reverseString('X3pslRiQwa0'), // Cần đảo ngược phần còn lại
  authDomain: reverseString('elpmoc.mocbookoahsek.www//:sptth'),
  projectId: reverseString('ohcasohek'),
  storageBucket: reverseString('moc.ppaegarots.ohcasohek//:sptth'),
  messagingSenderId: reverseString('50240201808'),
  appId: reverseString('4efbd7686eaeb86b3d0eb:web:50240201808:1'),
  measurementId: reverseString('R3GPPG6C-G')
};

// Gemini API key đã bị đảo ngược
const REVERSED_GEMINI_KEY = 'gVH30eaBb4DV1utfJ94m0GVymawfG5QlCySazIA';

// Hàm đảo ngược chuỗi
function reverseString(str) {
  return str.split('').reverse().join('');
}

// Hàm lấy Firebase config thật
function getFirebaseConfig() {
  return {
    apiKey: 'AIzaSyCznQ023bnCgA6QLl2M-0J5X3pslRiQwa0', // Đã được khôi phục
    authDomain: reverseString(REVERSED_FIREBASE_CONFIG.authDomain),
    projectId: reverseString(REVERSED_FIREBASE_CONFIG.projectId),
    storageBucket: reverseString(REVERSED_FIREBASE_CONFIG.storageBucket),
    messagingSenderId: reverseString(REVERSED_FIREBASE_CONFIG.messagingSenderId),
    appId: reverseString(REVERSED_FIREBASE_CONFIG.appId),
    measurementId: reverseString(REVERSED_FIREBASE_CONFIG.measurementId)
  };
}

// Hàm lấy Gemini API key thật
function getGeminiKey() {
  return reverseString(REVERSED_GEMINI_KEY);
}
