// ============== PIN MANAGER ==============
const APP_DEBUG = false;

function debugWarn() {
    if (!APP_DEBUG || typeof console === 'undefined' || typeof console.warn !== 'function') return;
    console.warn.apply(console, arguments);
}

function safeGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        return false;
    }
}

function safeRemoveItem(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {}
}

function safeGetJson(key, fallbackValue) {
    const raw = safeGetItem(key);
    if (raw === null || raw === '') return fallbackValue;

    try {
        return JSON.parse(raw);
    } catch (e) {
        safeRemoveItem(key);
        return fallbackValue;
    }
}

function safeSetJson(key, value) {
    return safeSetItem(key, JSON.stringify(value));
}

class PinManager {
    constructor() {
        this.pins = [];
        this.usedPins = [];
        this.createdDate = null;
    }

    generateRandomPin() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let pin = '';
        for (let i = 0; i < 8; i++) {
            pin += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return pin;
    }

    generatePins() {
        this.pins = [];
        this.usedPins = [];
        for (let i = 0; i < 8; i++) {
            let newPin;
            do {
                newPin = this.generateRandomPin();
            } while (this.pins.includes(newPin));
            this.pins.push(newPin);
        }
        this.createdDate = new Date();
        this.savePins();
        return this.pins;
    }

    savePins() {
        const pinsData = {
            pins: this.pins,
            usedPins: this.usedPins,
            createdDate: this.createdDate.getTime(),
            userEmail: appState.currentUser ? appState.currentUser.email : null
        };
        safeSetJson('userPins_' + (appState.currentUser ? appState.currentUser.email : ''), pinsData);
    }

    loadPins(email) {
        const pinsData = safeGetJson('userPins_' + email, null);
        if (pinsData) {
            this.pins = pinsData.pins || [];
            this.usedPins = pinsData.usedPins || [];
            this.createdDate = new Date(pinsData.createdDate);
            return true;
        }
        return false;
    }

    verifyPin(pin) {
        const pinUpper = pin.toUpperCase().trim();
        if (this.pins.includes(pinUpper) && !this.usedPins.includes(pinUpper)) {
            this.usedPins.push(pinUpper);
            this.savePins();
            return true;
        }
        return false;
    }

    canViewPins() {
        if (!this.createdDate) return false;
        const now = new Date();
        const diffTime = Math.abs(now - this.createdDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 30;
    }

    canGenerateNewPins() {
        return this.usedPins.length === this.pins.length && this.pins.length > 0;
    }

    getPinsStatus() {
        const remaining = this.pins.length - this.usedPins.length;
        return remaining;
    }

    getCreatedDateString() {
        if (!this.createdDate) return 'Chưa tạo';
        const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        return this.createdDate.toLocaleDateString('vi-VN', options);
    }

    getDaysUntilCanView() {
        if (!this.createdDate) return 0;
        const now = new Date();
        const diffTime = Math.abs(now - this.createdDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, 30 - diffDays);
    }

    getTimeUntilCanView() {
        if (!this.createdDate) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
        
        const now = new Date();
        const viewDate = new Date(this.createdDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        if (now >= viewDate) {
            return { days: 0, hours: 0, minutes: 0, seconds: 0 };
        }

        const diffTime = viewDate - now;
        const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffTime % (1000 * 60)) / 1000);

        return { days, hours, minutes, seconds };
    }
}

const pinManager = new PinManager();

// ============== CHAT HISTORY MANAGER ==============
class ChatHistoryManager {
    constructor() {
        this.maxHistories = 80;
        this.histories = [];
        this.currentSessionId = null;
        this.minOtherMessagesToPersist = 3;
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    startNewSession() {
        this.currentSessionId = this.generateSessionId();
        return this.currentSessionId;
    }

    getCurrentSessionId() {
        if (!this.currentSessionId) {
            this.startNewSession();
        }
        return this.currentSessionId;
    }

    addMessage(message, isUser = true) {
        const sessionId = this.getCurrentSessionId();
        const messageData = {
            text: message,
            isUser: isUser,
            timestamp: new Date().getTime()
        };

        const sessionIndex = this.histories.findIndex(function(h) { return h.id === sessionId; });
        let session;

        if (sessionIndex === -1) {
            session = {
                id: sessionId,
                title: this.generateTitle(message),
                messages: [],
                createdAt: new Date().getTime(),
                updatedAt: new Date().getTime()
            };
            this.histories.unshift(session);
            
            if (this.histories.length > this.maxHistories) {
                this.histories = this.histories.slice(0, this.maxHistories);
            }
        } else {
            session = this.histories[sessionIndex];
            if (sessionIndex > 0) {
                this.histories.splice(sessionIndex, 1);
                this.histories.unshift(session);
            }
        }

        session.messages.push(messageData);
        session.updatedAt = new Date().getTime();

        this.saveHistories();
        return session;
    }

    generateTitle(message) {
        const maxLength = 150;
        if (message.length > maxLength) {
            return message.substring(0, maxLength) + '...';
        }
        return message;
    }

    getSessionById(sessionId) {
        return this.histories.find(function(h) { return h.id === sessionId; });
    }

    loadSession(sessionId) {
        const session = this.getSessionById(sessionId);
        if (session) {
            this.currentSessionId = sessionId;
            return session;
        }
        return null;
    }

    deleteSession(sessionId) {
        const index = this.histories.findIndex(function(h) { return h.id === sessionId; });
        if (index !== -1) {
            this.histories.splice(index, 1);
            this.saveHistories();

            if (this.currentSessionId === sessionId) {
                if (this.histories.length > 0) {
                    this.currentSessionId = this.histories[0].id;
                } else {
                    this.currentSessionId = null;
                }
            }
            return true;
        }
        return false;
    }

    saveHistories() {
        if (appState.currentUser) {
            const key = 'chatHistories_' + appState.currentUser.email;
            safeSetJson(key, this.histories);
        }
    }

    countOtherMessages(session) {
        if (!session || !Array.isArray(session.messages)) return 0;
        return session.messages.reduce(function(total, msg) {
            if (msg && msg.isUser === false) return total + 1;
            return total;
        }, 0);
    }

    isSessionPersistable(session) {
        return this.countOtherMessages(session) >= this.minOtherMessagesToPersist;
    }

    pruneUnpersistableSessions() {
        const originalLength = this.histories.length;
        this.histories = this.histories.filter(function(session) {
            return this.isSessionPersistable(session);
        }.bind(this));
        return originalLength !== this.histories.length;
    }

    saveCurrentSessionOnExit() {
        if (!appState.currentUser) return;

        const currentSessionId = this.currentSessionId;
        const currentSession = currentSessionId ? this.getSessionById(currentSessionId) : null;
        if (!currentSession) {
            this.saveHistories();
            return;
        }

        if (!this.isSessionPersistable(currentSession)) {
            this.histories = this.histories.filter(function(session) {
                return session.id !== currentSession.id;
            });
        }

        this.saveHistories();
    }

    loadHistories(email) {
        if (!email) {
            this.histories = [];
            this.currentSessionId = null;
            return;
        }

        const key = 'chatHistories_' + email;
        const saved = safeGetJson(key, []);
        this.histories = Array.isArray(saved) ? saved : [];
        const hasPruned = this.pruneUnpersistableSessions();
        if (hasPruned && appState.currentUser) {
            this.saveHistories();
        }

        this.currentSessionId = this.histories.length > 0 ? this.histories[0].id : null;
    }

    getAllHistories() {
        return this.histories.slice().sort(function(a, b) {
            return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
        });
    }
}

const chatHistoryManager = new ChatHistoryManager();
const DEMO_EMAIL = 'demo@vietverse.com';
const INTRO_DEFAULT_THEME = 'light';
const INTRO_DEFAULT_PRIMARY_COLOR = '#FF8C42';
const SESSION_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;
const SESSION_CHECK_INTERVAL_MS = 30 * 1000;
const SESSION_LAST_ACTIVITY_KEY = 'sessionLastActivityAt';
const DEFAULT_AVATAR_DATA =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='150' height='150' fill='%23FFE6D1'/%3E%3Ccircle cx='75' cy='48' r='30' fill='%23FF8C42'/%3E%3Cpath d='M20 150a55 55 0 0 1 110 0Z' fill='%23FF8C42'/%3E%3C/svg%3E";

function isDemoEmail(email) {
    return String(email || '').trim().toLowerCase() === DEMO_EMAIL;
}

// ============== STATE MANAGEMENT ==============
class AppState {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.currentPage = 'login';
        this.healthHistory = [];
        this.dailyCheckIns = [];
        this.gamification = this.getDefaultGamificationState();
        this.initialHealthData = {
            name: '',
            health: '',
            busyTimes: [],
            freeTimes: [],
            goals: [],
            preferences: ''
        };
        this.initializeDemoUser();
        this.loadFromLocalStorage();
    }

    getDefaultGamificationState() {
        return {
            coins: 0,
            dailyMissions: {
                dateKey: '',
                missions: [],
                chatSeconds: 0
            },
            shopInventory: {
                streakShield: 0,
                honorBadge: 0
            },
            shopWeeklySales: {
                weekKey: '',
                purchases: {}
            },
            streakShieldUsedDates: []
        };
    }

    getGamificationKey() {
        const userEmail = this.currentUser && this.currentUser.email
            ? this.currentUser.email.trim().toLowerCase()
            : 'guest';
        return 'gamification_' + userEmail;
    }

    normalizeShopInventory(inventory) {
        const parsed = inventory && typeof inventory === 'object' ? inventory : {};
        return {
            streakShield: Math.max(0, parseInt(parsed.streakShield, 10) || 0),
            honorBadge: Math.max(0, parseInt(parsed.honorBadge, 10) || 0)
        };
    }

    normalizeShopWeeklySales(sales) {
        const parsed = sales && typeof sales === 'object' ? sales : {};
        const purchases = {};

        if (parsed.purchases && typeof parsed.purchases === 'object') {
            Object.keys(parsed.purchases).forEach(function(key) {
                purchases[key] = Math.max(0, parseInt(parsed.purchases[key], 10) || 0);
            });
        }

        return {
            weekKey: typeof parsed.weekKey === 'string' ? parsed.weekKey : '',
            purchases: purchases
        };
    }

    normalizeDailyMissionState(missionState) {
        const parsed = missionState && typeof missionState === 'object' ? missionState : {};
        const missions = Array.isArray(parsed.missions) ? parsed.missions : [];

        const normalizedMissions = missions.map(function(mission) {
            if (!mission || typeof mission !== 'object') return null;
            const target = Math.max(1, parseInt(mission.target, 10) || 1);
            const progress = Math.max(0, Math.min(target, parseInt(mission.progress, 10) || 0));
            const reward = Math.max(0, parseInt(mission.reward, 10) || 0);
            const completed = !!mission.completed || progress >= target;

            return {
                id: typeof mission.id === 'string' ? mission.id : '',
                type: typeof mission.type === 'string' ? mission.type : '',
                title: typeof mission.title === 'string' ? mission.title : '',
                target: target,
                progress: progress,
                reward: reward,
                completed: completed,
                rewardClaimed: !!mission.rewardClaimed
            };
        }).filter(function(mission) { return mission !== null; });

        return {
            dateKey: typeof parsed.dateKey === 'string' ? parsed.dateKey : '',
            missions: normalizedMissions,
            chatSeconds: Math.max(0, parseInt(parsed.chatSeconds, 10) || 0)
        };
    }

    normalizeShieldUsedDates(dates) {
        if (!Array.isArray(dates)) return [];

        const unique = new Set();
        dates.forEach(function(dateKey) {
            if (typeof dateKey === 'string' && dateKey) unique.add(dateKey);
        });

        return Array.from(unique).sort();
    }

    normalizeGamificationState(data) {
        const defaults = this.getDefaultGamificationState();
        const parsed = data && typeof data === 'object' ? data : {};

        return {
            coins: Math.max(0, parseInt(parsed.coins, 10) || 0),
            dailyMissions: this.normalizeDailyMissionState(parsed.dailyMissions || defaults.dailyMissions),
            shopInventory: this.normalizeShopInventory(parsed.shopInventory || defaults.shopInventory),
            shopWeeklySales: this.normalizeShopWeeklySales(parsed.shopWeeklySales || defaults.shopWeeklySales),
            streakShieldUsedDates: this.normalizeShieldUsedDates(parsed.streakShieldUsedDates || defaults.streakShieldUsedDates)
        };
    }

    initializeDemoUser() {
        const usersRaw = safeGetJson('users', []);
        const users = Array.isArray(usersRaw) ? usersRaw : [];
        if (!users.some(function(u) { return isDemoEmail(u.email); })) {
            users.push({
                id: Date.now(),
                name: 'Người Dùng Demo',
                email: DEMO_EMAIL,
                password: '123456'
            });
            safeSetJson('users', users);
        }

        const demoSettingsKey = 'userSettings_' + DEMO_EMAIL;
        const demoSettings = safeGetJson(demoSettingsKey, null);
        if (!demoSettings || typeof demoSettings !== 'object') {
            safeSetJson(demoSettingsKey, {
                theme: INTRO_DEFAULT_THEME,
                primaryColor: INTRO_DEFAULT_PRIMARY_COLOR
            });
        }
    }

    getSessionLastActivityAt() {
        const raw = safeGetItem(SESSION_LAST_ACTIVITY_KEY);
        const timestamp = parseInt(raw, 10);
        return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
    }

    setSessionLastActivityAt(timestamp) {
        const value = Number.isFinite(timestamp) ? Math.floor(timestamp) : Date.now();
        safeSetItem(SESSION_LAST_ACTIVITY_KEY, String(value));
    }

    touchSessionActivity() {
        this.setSessionLastActivityAt(Date.now());
    }

    clearSessionActivity() {
        safeRemoveItem(SESSION_LAST_ACTIVITY_KEY);
    }

    isSessionExpired(nowTimestamp) {
        const lastActivity = this.getSessionLastActivityAt();
        if (!lastActivity) return false;
        const now = Number.isFinite(nowTimestamp) ? nowTimestamp : Date.now();
        return now - lastActivity >= SESSION_INACTIVITY_TIMEOUT_MS;
    }

    loadFromLocalStorage() {
        const savedUser = safeGetJson('currentUser', null);
        const savedHealth = safeGetJson('healthHistory', []);
        const savedInitialHealth = safeGetJson('initialHealthData', null);

        if (savedUser && typeof savedUser === 'object') {
            if (this.isSessionExpired()) {
                safeRemoveItem('currentUser');
                this.clearSessionActivity();
            } else {
                this.currentUser = savedUser;
                this.isAuthenticated = true;
                this.touchSessionActivity();
                pinManager.loadPins(this.currentUser.email);
            }
        }

        if (Array.isArray(savedHealth)) {
            this.healthHistory = savedHealth;
        }

        if (savedInitialHealth && typeof savedInitialHealth === 'object') {
            this.initialHealthData = savedInitialHealth;
        }

        this.loadDailyCheckIns();
        this.loadGamificationState();
    }

    saveToLocalStorage() {
        if (this.currentUser) {
            safeSetJson('currentUser', this.currentUser);
        }
        safeSetJson('healthHistory', this.healthHistory);
        safeSetJson('initialHealthData', this.initialHealthData);
        this.saveDailyCheckIns();
        this.saveGamificationState();
    }

    getDailyCheckInKey() {
        const userEmail = this.currentUser && this.currentUser.email
            ? this.currentUser.email.trim().toLowerCase()
            : 'guest';
        return 'dailyCheckIns_' + userEmail;
    }

    normalizeDailyCheckIns(list) {
        if (!Array.isArray(list)) return [];
        return list.map(function(item) {
            if (typeof item === 'string') {
                return {
                    dateKey: item,
                    source: 'legacy',
                    timestamp: null
                };
            }
            if (!item || typeof item !== 'object') return null;
            if (!item.dateKey || typeof item.dateKey !== 'string') return null;
            return {
                dateKey: item.dateKey,
                source: typeof item.source === 'string' ? item.source : 'manual',
                timestamp: typeof item.timestamp === 'number' ? item.timestamp : null
            };
        }).filter(function(item) { return item !== null; });
    }

    loadDailyCheckIns() {
        const saved = safeGetJson(this.getDailyCheckInKey(), []);
        this.dailyCheckIns = this.normalizeDailyCheckIns(saved);
    }

    saveDailyCheckIns() {
        safeSetJson(this.getDailyCheckInKey(), this.dailyCheckIns || []);
    }

    loadGamificationState() {
        const raw = safeGetJson(this.getGamificationKey(), null);
        if (!raw) {
            this.gamification = this.getDefaultGamificationState();
            return;
        }

        this.gamification = this.normalizeGamificationState(raw);
    }

    saveGamificationState() {
        this.gamification = this.normalizeGamificationState(this.gamification);
        safeSetJson(this.getGamificationKey(), this.gamification);
    }
}

const appState = new AppState();

// ============== SETTINGS MANAGER ==============
class SettingsManager {
    constructor() {
        this.loadSettings();
    }

    buildSettingsKeyByEmail(email) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        return normalizedEmail ? 'userSettings_' + normalizedEmail : 'userSettings_guest';
    }

    getSettingsKey() {
        const userEmail = appState.currentUser && appState.currentUser.email
            ? appState.currentUser.email
            : '';
        return this.buildSettingsKeyByEmail(userEmail);
    }

    getDefaultSettings() {
        return {
            theme: INTRO_DEFAULT_THEME,
            primaryColor: INTRO_DEFAULT_PRIMARY_COLOR
        };
    }

    getLegacySettings() {
        return safeGetJson('userSettings', null);
    }

    normalizeTheme(theme) {
        return theme === 'dark' ? 'dark' : 'light';
    }

    normalizePrimaryColor(color) {
        if (!color) return null;
        let value = String(color).trim();
        if (!value.startsWith('#')) value = '#' + value;
        if (/^#[0-9a-fA-F]{3}$/.test(value)) {
            value = '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
        }
        return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : null;
    }

    loadSettings() {
        const settingsKey = this.getSettingsKey();
        const defaults = this.getDefaultSettings();
        let settings = Object.assign({}, defaults);
        const saved = safeGetJson(settingsKey, null);
        const isDemoAccount = !!(appState.currentUser && isDemoEmail(appState.currentUser.email));

        if (saved && typeof saved === 'object') {
            settings = Object.assign({}, defaults, saved);
        }

        settings.theme = this.normalizeTheme(settings.theme);
        settings.primaryColor = this.normalizePrimaryColor(settings.primaryColor) || defaults.primaryColor;

        if (isDemoAccount) {
            settings.theme = defaults.theme;
            settings.primaryColor = defaults.primaryColor;
        }

        safeSetJson(settingsKey, settings);

        if (settings.theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        this.setThemeColor(settings.primaryColor);

        if (isDemoAccount) {
            this.updateAvatarDisplay(DEFAULT_AVATAR_DATA);
        } else if (settings.avatar) {
            this.updateAvatarDisplay(settings.avatar);
        } else {
            this.updateAvatarDisplay(DEFAULT_AVATAR_DATA);
        }
    }

    saveSettings(settings) {
        const defaults = this.getDefaultSettings();
        const merged = Object.assign({}, defaults, settings || {});
        merged.theme = this.normalizeTheme(merged.theme);
        merged.primaryColor = this.normalizePrimaryColor(merged.primaryColor) || defaults.primaryColor;
        safeSetJson(this.getSettingsKey(), merged);
    }

    getSettings() {
        const defaults = this.getDefaultSettings();
        const saved = safeGetJson(this.getSettingsKey(), null);
        if (!saved || typeof saved !== 'object') return Object.assign({}, defaults);

        const merged = Object.assign({}, defaults, saved);
        merged.theme = this.normalizeTheme(merged.theme);
        merged.primaryColor = this.normalizePrimaryColor(merged.primaryColor) || defaults.primaryColor;
        return merged;
    }

    setThemeColor(color) {
        document.documentElement.style.setProperty('--primary-color', color);
        const dark = this.darkenColor(color, 0.2);
        const light = this.lightenColor(color, 0.3);
        document.documentElement.style.setProperty('--primary-dark', dark);
        document.documentElement.style.setProperty('--primary-light', light);
        document.documentElement.style.setProperty('--jade', color);
        document.documentElement.style.setProperty('--jade2', dark);
        document.documentElement.style.setProperty('--gold', this.lightenColor(color, 0.2));
    }

    darkenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }

    lightenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }

    updateAvatarDisplay(avatarData) {
        const imgs = document.querySelectorAll('#avatarImg, #profileAvatarImg, #settingsAvatarImg');
        imgs.forEach(function(img) {
            if (img) img.src = avatarData;
        });
    }
}

const settingsManager = new SettingsManager();

// ============== AI ENGINE - ENHANCED (V2) ==============
class AIEngine {
    constructor() {
        this.conversationContext = [];
        this.conversationHistory = [];
        this.rightCareUrl = 'https://chatgpt.com/g/g-67657a1bfffc819190a59d65f229376d-rightcare-tu-van-suc-khoe';
        const configuredEndpoint = typeof window.CHAT_API_ENDPOINT === 'string'
            ? window.CHAT_API_ENDPOINT.trim()
            : '';
        this.configuredEndpoint = configuredEndpoint;
        this.localChatApiEndpoint = 'http://localhost:3000/api/chat';
        this.remoteChatApiEndpoint = 'https://vietverse-server.onrender.com/api/chat';
        const isLocal = window.location.protocol === 'file:' ||
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';
        this.chatApiEndpoint = configuredEndpoint ||
            (isLocal ? this.localChatApiEndpoint : this.remoteChatApiEndpoint);
    }

    generateResponse(message) {
        this.conversationContext.push(message);
        this.conversationHistory.push({
            timestamp: new Date(),
            message: message,
            type: 'user'
        });

        const lowerMessage = message.toLowerCase().trim();

        if (this.isHealthWebsiteRequest(lowerMessage)) {
            return this.handleHealthWebsiteRequest();
        }

        if (this.isOffTopic(lowerMessage)) {
            return this.getOffTopicResponse();
        }

        if (this.isGreeting(lowerMessage)) {
            return this.getRandomGreeting();
        }

        if (this.isThanks(lowerMessage)) {
            return this.getRandomThanksResponse();
        }

        if (this.isApology(lowerMessage)) {
            return this.getRandomApologyResponse();
        }

        if (this.isHealthRelated(lowerMessage)) {
            return this.handleHealthQuestion(lowerMessage, message);
        }

        if (this.isMealRelated(lowerMessage)) {
            return this.handleMealQuestion(lowerMessage, message);
        }

        if (this.isActivityRelated(lowerMessage)) {
            return this.handleActivityQuestion(lowerMessage, message);
        }

        if (this.isTimeRelated(lowerMessage)) {
            return this.handleTimeQuestion(lowerMessage, message);
        }

        if (this.isMentalHealthRelated(lowerMessage)) {
            return this.handleMentalHealthQuestion(lowerMessage, message);
        }

        if (this.isEmotionalRelated(lowerMessage)) {
            return this.handleEmotionalQuestion(lowerMessage, message);
        }

        if (this.isSleepRelated(lowerMessage)) {
            return this.handleSleepQuestion(lowerMessage, message);
        }

        if (this.isWeightRelated(lowerMessage)) {
            return this.handleWeightQuestion(lowerMessage, message);
        }

        return this.handleGeneralQuestion(lowerMessage, message);
    }

    async generateResponseAsync(message) {
        const lowerMessage = message.toLowerCase().trim();

        if (this.isHealthWebsiteRequest(lowerMessage)) {
            return this.handleHealthWebsiteRequest();
        }

        const apiReply = await this.getDeepSeekResponse(message);
        if (apiReply) {
            return this.escapeHtml(apiReply).replace(/\n/g, '<br>') + this.getRightCareSuggestion();
        }

        return this.generateResponse(message);
    }

    sleep(ms) {
        return new Promise(function(resolve) {
            setTimeout(resolve, ms);
        });
    }

    getCandidateChatEndpoints() {
        const endpoints = [this.chatApiEndpoint];
        if (this.localChatApiEndpoint && this.chatApiEndpoint !== this.localChatApiEndpoint) {
            endpoints.push(this.localChatApiEndpoint);
        }
        if (this.remoteChatApiEndpoint && this.chatApiEndpoint !== this.remoteChatApiEndpoint) {
            endpoints.push(this.remoteChatApiEndpoint);
        }
        return Array.from(new Set(endpoints.filter(Boolean)));
    }

    async getDeepSeekResponse(message) {
        const endpoints = this.getCandidateChatEndpoints();
        for (let endpointIndex = 0; endpointIndex < endpoints.length; endpointIndex++) {
            const endpoint = endpoints[endpointIndex];

            for (let attempt = 0; attempt < 2; attempt++) {
                const controller = new AbortController();
                const timeoutId = setTimeout(function() { controller.abort(); }, 20000);

                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            messages: [
                                {
                                    role: 'system',
                                    content: 'Ban la Sao Vang - chuyen gia ve lich su va van hoa Viet Nam. Tra loi bang tieng Viet, ngan gon, chinh xac va than thien.'
                                },
                                {
                                    role: 'user',
                                    content: message
                                }
                            ],
                            max_tokens: 220,
                            temperature: 0.7
                        }),
                        signal: controller.signal
                    });

                    let data = null;
                    try {
                        data = await response.json();
                    } catch (parseError) {
                        data = null;
                    }

                    if (response.ok) {
                        if (data && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
                            return String(data.choices[0].message.content).trim();
                        }

                        return null;
                    }

                    const isRateLimit = response.status === 429;
                    if (isRateLimit && attempt === 0) {
                        const waitMs = 1500;
                        await this.sleep(waitMs);
                        continue;
                    }

                    const errorDetails = data && data.details ? data.details : data;
                    debugWarn('Chat backend error:', endpoint, response.status, errorDetails);
                    break;
                } catch (error) {
                    debugWarn('DeepSeek request failed:', endpoint, error, 'Backend co the chua chay. Hay chay chatbot-server o cong 3000.');
                    break;
                } finally {
                    clearTimeout(timeoutId);
                }
            }
        }

        return null;
    }

    isOffTopic(msg) {
        const offTopicKeywords = [
            'tên bạn', 'bạn tên gì', 'bạn là ai', 'mày là ai', 'ai vậy',
            'bạn từ đâu', 'bạn ở đâu', 'bạn bao nhiêu tuổi', 'bạn có bạn gái',
            'hãy làm', 'làm hộ tôi', 'giúp tôi làm', 'viết code', 'code cho tôi',
            'bạn yêu ai', 'bạn thích gì', 'bạn sao', 'bạn đang làm gì',
            'meme', 'đùa', 'cười', 'haha', 'hihi', 'hehe', 'hihihi',
            'troll', 'chế giễu', 'nhạo báng', 'chửi', 'xúc phạm',
            'không biết', 'ko biết', 'chẳng biết', 'ko hiểu', 'không hiểu',
            'gì vậy', 'sao vậy', 'kiểu gì', 'làm sao', 'thế nào',
            'cây ngoài lề', 'ngoài đề', 'không liên quan', 'vô liên quan',
            'politics', 'chính trị', 'dân tộc', 'tôn giáo', 'xâm nhập',
            'hack', 'virus', 'crack', 'pirate'
        ];

        return offTopicKeywords.some(function(keyword) {
            return msg.includes(keyword);
        });
    }

    getOffTopicResponse() {
        const responses = [
            '🤔 Câu hỏi hay! Nhưng tôi chỉ chuyên về lịch sử và văn hóa Việt Nam thôi.\n\n✅ Hãy hỏi tôi về:\n• Vua Hùng\n• Chiến thắng Bạch Đằng\n• Áo dài\n• Tết Nguyên Đán',
            '😄 Bạn đang hỏi ngoài lề rồi!\n\n💚 Tôi là Sao Vàng, chuyên gia về:\n1. Lịch sử Việt Nam\n2. Văn hóa truyền thống\n3. Phong tục tập quán\n4. Danh nhân lịch sử',
            '👀 Oops! Câu hỏi này không liên quan đến văn hóa Việt Nam.\n\n🎯 Hãy hỏi tôi về:\n• Các triều đại\n• Lễ hội truyền thống\n• Ẩm thực Việt\n• Di tích lịch sử'
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    isHealthWebsiteRequest(msg) {
        return false; // Không cần cho Vietverse
    }

    handleHealthWebsiteRequest() {
        return ''; // Không cần cho Vietverse
    }

    isGreeting(msg) {
        const greetings = ['xin chào', 'chào', 'hello', 'hi', 'hey', 'halo', 'hôm nay thế nào', 'bạn khỏe không', 'khoẻ không'];
        return greetings.some(function(g) { return msg.includes(g); });
    }

    isThanks(msg) {
        const thanks = ['cảm ơn', 'thanks', 'thank you', 'tks', 'cảm ơn nhiều', 'cảm ơn bạn'];
        return thanks.some(function(t) { return msg.includes(t); });
    }

    isApology(msg) {
        const apologies = ['xin lỗi', 'lỗi', 'sorry', 'miễn lỗi', 'mình xin lỗi'];
        return apologies.some(function(a) { return msg.includes(a); });
    }

    isHealthRelated(msg) {
        const healthKeywords = [
            'sức khỏe', 'khỏe', 'bệnh', 'đau', 'mệt',
            'ăn uống', 'dinh dưỡng', 'tập luyện', 'thể dục'
        ];
        return healthKeywords.some(function(k) { return msg.includes(k); });
    }

    isMentalHealthRelated(msg) {
        const mentalKeywords = [
            'stress', 'căng thẳng', 'lo lắng', 'trầm cảm',
            'tâm lý', 'tinh thần', 'chán nản', 'buồn'
        ];
        return mentalKeywords.some(function(k) { return msg.includes(k); });
    }

    isEmotionalRelated(msg) {
        const emotionalKeywords = [
            'cảm xúc', 'tâm trạng', 'giận', 'vui', 'buồn',
            'lo', 'sợ', 'đau lòng', 'khó chịu'
        ];
        return emotionalKeywords.some(function(k) { return msg.includes(k); });
    }

    isSleepRelated(msg) {
        const sleepKeywords = [
            'ngủ', 'mất ngủ', 'giấc ngủ', 'ngủ không', 'buồn ngủ',
            'mệt', 'không ngủ', 'dậy sớm'
        ];
        return sleepKeywords.some(function(k) { return msg.includes(k); });
    }

    isWeightRelated(msg) {
        const weightKeywords = [
            'giảm cân', 'tăng cân', 'béo', 'gầy', 'cân nặng',
            'weight', 'eo', 'bụng', 'cơ bắp', 'tăng cơ'
        ];
        return weightKeywords.some(function(k) { return msg.includes(k); });
    }

    isMealRelated(msg) {
        const mealKeywords = [
            'ăn', 'bữa', 'cơm', 'thịt', 'rau', 'trái cây', 'dinh dưỡng',
            'đường', 'mặn', 'ngọt', 'nước', 'uống',
            'bữa ăn', 'đồ ăn', 'thực phẩm', 'chế độ ăn'
        ];
        return mealKeywords.some(function(k) { return msg.includes(k); });
    }

    isActivityRelated(msg) {
        const activityKeywords = [
            'tập', 'chạy', 'yoga', 'gym', 'bơi', 'đạp xe', 'thể dục',
            'exercise', 'hoạt động', 'vận động', 'thể thao'
        ];
        return activityKeywords.some(function(k) { return msg.includes(k); });
    }

    isTimeRelated(msg) {
        const timeKeywords = [
            'mấy giờ', 'giờ nào', 'khi nào', 'sáng', 'trưa', 'chiều', 'tối',
            'thời gian', 'lúc nào', 'ngày', 'tuần', 'tháng'
        ];
        return timeKeywords.some(function(k) { return msg.includes(k); });
    }

    getRandomGreeting() {
        const greetings = [
            '👋 Xin chào! Tôi là Sao Vàng, chuyên gia về lịch sử và văn hóa Việt Nam. Bạn muốn tìm hiểu về điều gì?',
            '😊 Chào bạn! Rất vui được gặp bạn. Hôm nay tôi có thể giúp gì về văn hóa Việt Nam?',
            '👋 Hi! Tôi ở đây để chia sẻ kiến thức về lịch sử và văn hóa Việt Nam.',
            '🌟 Chào! Hôm nay bạn muốn khám phá điều gì về đất nước Việt Nam?'
        ];
        return this.getRandomElement(greetings);
    }

    getRandomThanksResponse() {
        const responses = [
            '😊 Không có chi! Tôi luôn sẵn lòng giúp bạn. Có điều gì khác bạn muốn tìm hiểu không?',
            '🌟 Vui lòng! Đó là công việc của tôi. Còn gì tôi có thể giúp không?',
            '💚 Không cần phải cảm ơn! Hãy tiếp tục khám phá văn hóa Việt Nam cùng tôi.'
        ];
        return this.getRandomElement(responses);
    }

    getRandomApologyResponse() {
        const responses = [
            '😄 Không sao! Không cần xin lỗi. Hãy cứ thoải mái hỏi tôi bất cứ điều gì về văn hóa Việt Nam!',
            '💚 Không có vấn đề gì cả! Tôi ở đây để giúp bạn.',
            '😊 Đừng lo! Hãy tiếp tục đặt câu hỏi của bạn.'
        ];
        return this.getRandomElement(responses);
    }

    handleMentalHealthQuestion(lowerMsg) {
        return this.handleGeneralQuestion(lowerMsg, '');
    }

    handleEmotionalQuestion(lowerMsg) {
        return this.handleGeneralQuestion(lowerMsg, '');
    }

    handleSleepQuestion(lowerMsg) {
        return this.handleGeneralQuestion(lowerMsg, '');
    }

    handleWeightQuestion(lowerMsg) {
        return this.handleGeneralQuestion(lowerMsg, '');
    }

    handleHealthQuestion(lowerMsg) {
        return this.handleGeneralQuestion(lowerMsg, '');
    }

    handleMealQuestion(lowerMsg) {
        return this.handleGeneralQuestion(lowerMsg, '');
    }

    handleActivityQuestion(lowerMsg) {
        return this.handleGeneralQuestion(lowerMsg, '');
    }

    handleTimeQuestion(lowerMsg) {
        return this.handleGeneralQuestion(lowerMsg, '');
    }

    handleGeneralQuestion(lowerMsg, originalMsg) {
        const responses = [
            '🤔 Câu hỏi hay! Bạn có thể mô tả rõ hơn về khía cạnh lịch sử hoặc văn hóa bạn muốn tìm hiểu không?',
            '💡 Thú vị! Cho tôi biết thêm chi tiết để tôi có thể giúp bạn tốt nhất.',
            '👂 Tôi đang lắng nghe! Hãy nói chi tiết hơn để tôi hiểu rõ bạn muốn biết gì về văn hóa Việt Nam.',
            '🎯 Hay lắm! Hãy cụ thể hóa câu hỏi để tôi giúp bạn tối đa!',
            '💬 Mình hiểu! Bạn đang muốn tìm hiểu về điều gì?',
            '🌟 Ý tưởng hay! Bạn cần giúp gì cụ thể về lịch sử Việt Nam?'
        ];
        return this.getRandomElement(responses);
    }

    getRightCareSuggestion() {
        return ''; // Không cần cho Vietverse
    }

    getRandomElement(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    getRandomResponse(responses) {
        return this.getRandomElement(responses);
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }
}

const aiEngine = new AIEngine();

// ============== INITIAL CHAT FLOW ==============
class InitialChatFlow {
    constructor() {
        this.stage = 0;
        this.collectedInfo = {
            health: '',
            schedule: '',
            diet: '',
            goals: ''
        };
    }

    startFlow() {
        this.stage = 0;
        this.collectedInfo = { health: '', schedule: '', diet: '', goals: '' };
        this.showWelcomeMessage();
    }

    showWelcomeMessage() {
        const chatFlow = document.getElementById('chatFlow');
        chatFlow.innerHTML = '';

        const aiMessage = document.createElement('div');
        aiMessage.className = 'chat-bubble ai';
        aiMessage.innerHTML = '<p>🎉 Xin chào ' + appState.currentUser.name + '!\n\n💬 Hãy cho tôi biết về bạn.\n\nHôm nay bạn cảm thấy như thế nào?</p>';
        chatFlow.appendChild(aiMessage);
        this.createInputArea();
    }

    createInputArea() {
        const chatFlow = document.getElementById('chatFlow');
        const oldInput = chatFlow.querySelector('.user-input-area');
        if (oldInput) oldInput.remove();

        const inputContainer = document.createElement('div');
        inputContainer.className = 'user-input-area';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Nhập câu trả lời...';
        input.style.flex = '1';
        input.style.padding = '12px 15px';
        input.style.border = '1px solid var(--border-color)';
        input.style.borderRadius = '24px';
        input.style.fontSize = '14px';

        const sendBtn = document.createElement('button');
        sendBtn.textContent = '➤';
        sendBtn.style.background = 'var(--primary-color)';
        sendBtn.style.border = 'none';
        sendBtn.style.color = 'white';
        sendBtn.style.width = '40px';
        sendBtn.style.height = '40px';
        sendBtn.style.borderRadius = '50%';
        sendBtn.style.cursor = 'pointer';
        sendBtn.style.fontSize = '18px';
        sendBtn.style.marginLeft = '10px';
        const self = this;

        sendBtn.addEventListener('click', function() {
            self.handleUserMessage(input.value);
            input.value = '';
            input.focus();
        });

        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                self.handleUserMessage(input.value);
                input.value = '';
                input.focus();
            }
        });

        inputContainer.appendChild(input);
        inputContainer.appendChild(sendBtn);
        chatFlow.appendChild(inputContainer);
        input.focus();
    }

    handleUserMessage(message) {
        if (!message.trim()) return;

        const chatFlow = document.getElementById('chatFlow');
        const userBubble = document.createElement('div');
        userBubble.className = 'chat-bubble user';
        userBubble.innerHTML = '<p>' + aiEngine.escapeHtml(message) + '</p>';
        chatFlow.appendChild(userBubble);

        const oldInput = chatFlow.querySelector('.user-input-area');
        if (oldInput) oldInput.remove();

        setTimeout(function() {
            chatFlow.scrollTop = chatFlow.scrollHeight;
        }, 100);

        const self = this;
        setTimeout(function() {
            self.processMessage(message);
        }, 500);
    }

    processMessage(message) {
        const chatFlow = document.getElementById('chatFlow');
        const loading = document.createElement('div');
        loading.className = 'chat-bubble ai';
        loading.innerHTML = '<div style="display: flex; gap: 6px;"><span style="width: 8px; height: 8px; background: var(--primary-color); border-radius: 50%; animation: bounce 1.4s infinite;"></span><span style="width: 8px; height: 8px; background: var(--primary-color); border-radius: 50%; animation: bounce 1.4s infinite; animation-delay: 0.2s;"></span><span style="width: 8px; height: 8px; background: var(--primary-color); border-radius: 50%; animation: bounce 1.4s infinite; animation-delay: 0.4s;"></span></div>';
        chatFlow.appendChild(loading);

        const self = this;

        setTimeout(function() {
            loading.remove();

            let response = '';

            if (self.stage === 0) {
                self.collectedInfo.health = message;
                response = '✅ Ghi nhận: ' + message + '.\n\n📅 Bạn rảnh giờ nào? (Sáng, trưa, chiều, tối?)';
                self.stage = 1;
            } else if (self.stage === 1) {
                self.collectedInfo.schedule = message;
                response = '✅ Bạn rảnh ' + message + '.\n\n🍽️ Bạn ăn gì trong ngày?';
                self.stage = 2;
            } else if (self.stage === 2) {
                self.collectedInfo.diet = message;
                response = '✅ Bạn ăn ' + message + '.\n\n🎯 Mục tiêu sức khỏe là gì?';
                self.stage = 3;
            } else if (self.stage === 3) {
                self.collectedInfo.goals = message;
                response = '✅ Mục tiêu: ' + message + '\n\n🎉 Lịch trình đã sẵn sàng!';
                self.stage = 4;
            }

            const aiMessage = document.createElement('div');
            aiMessage.className = 'chat-bubble ai';
            aiMessage.innerHTML = '<p>' + response + '</p>';
            chatFlow.appendChild(aiMessage);
            chatFlow.scrollTop = chatFlow.scrollHeight;

            if (self.stage === 4) {
                setTimeout(function() {
                    self.finishFlow();
                }, 1000);
            } else {
                self.createInputArea();
            }
        }, 800);
    }

    finishFlow() {
        const chatFlow = document.getElementById('chatFlow');
        const oldInput = chatFlow.querySelector('.user-input-area');
        if (oldInput) oldInput.remove();

        appState.initialHealthData.name = appState.currentUser.name;
        appState.initialHealthData.health = this.collectedInfo.health;
        appState.initialHealthData.preferences = this.collectedInfo.schedule + ' | ' + this.collectedInfo.diet + ' | ' + this.collectedInfo.goals;
        appState.saveToLocalStorage();

        const completeMsg = document.createElement('div');
        completeMsg.className = 'chat-bubble ai';
        completeMsg.innerHTML = '<p>📊 Thông tin của bạn:\n💪 ' + this.collectedInfo.health + '\n📅 ' + this.collectedInfo.schedule + '\n🍽️ ' + this.collectedInfo.diet + '\n🎯 ' + this.collectedInfo.goals + '</p>';
        chatFlow.appendChild(completeMsg);

        const startContainer = document.createElement('div');
        startContainer.style.padding = '20px';
        startContainer.style.textAlign = 'center';

        const startBtn = document.createElement('button');
        startBtn.textContent = '🚀 Bắt Đầu';
        startBtn.className = 'option-btn';
        startBtn.style.width = 'calc(100% - 40px)';
        startBtn.style.margin = '0 20px';
        startBtn.addEventListener('click', function() {
            app.goToPage('chat');
        });

        startContainer.appendChild(startBtn);
        chatFlow.appendChild(startContainer);
        chatFlow.scrollTop = chatFlow.scrollHeight;
    }
}

// ============== AVATAR CROP MANAGER ==============
class AvatarCropManager {
    constructor() {
        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.imageSrc = '';
    }

    openModal(imageSrc) {
        const modal = document.getElementById('avatarCropModal');
        const cropImage = document.getElementById('cropImage');
        const zoomSlider = document.getElementById('zoomSlider');

        this.imageSrc = imageSrc;
        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1;
        cropImage.src = imageSrc;
        zoomSlider.value = 1;
        cropImage.style.transform = 'translate(0, 0) scale(1)';

        modal.classList.add('active');

        this.setupDragListeners(cropImage);
        this.setupZoomListener(zoomSlider, cropImage);
    }

    closeModal() {
        const modal = document.getElementById('avatarCropModal');
        const cropImage = document.getElementById('cropImage');
        modal.classList.remove('active');
        cropImage.style.transform = 'translate(0, 0) scale(1)';
        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1;
    }

    setupDragListeners(cropImage) {
        const self = this;

        cropImage.addEventListener('mousedown', function(e) {
            self.isDragging = true;
            self.startX = e.clientX - self.offsetX;
            self.startY = e.clientY - self.offsetY;
        });

        document.addEventListener('mousemove', function(e) {
            if (self.isDragging) {
                self.offsetX = e.clientX - self.startX;
                self.offsetY = e.clientY - self.startY;
                cropImage.style.transform = 'translate(' + self.offsetX + 'px, ' + self.offsetY + 'px) scale(' + self.scale + ')';
            }
        });

        document.addEventListener('mouseup', function() {
            self.isDragging = false;
        });

        cropImage.addEventListener('touchstart', function(e) {
            self.isDragging = true;
            self.startX = e.touches[0].clientX - self.offsetX;
            self.startY = e.touches[0].clientY - self.offsetY;
        });

        document.addEventListener('touchmove', function(e) {
            if (self.isDragging) {
                self.offsetX = e.touches[0].clientX - self.startX;
                self.offsetY = e.touches[0].clientY - self.startY;
                cropImage.style.transform = 'translate(' + self.offsetX + 'px, ' + self.offsetY + 'px) scale(' + self.scale + ')';
            }
        });

        document.addEventListener('touchend', function() {
            self.isDragging = false;
        });
    }

    setupZoomListener(zoomSlider, cropImage) {
        const self = this;
        zoomSlider.addEventListener('input', function(e) {
            self.scale = parseFloat(e.target.value);
            cropImage.style.transform = 'translate(' + self.offsetX + 'px, ' + self.offsetY + 'px) scale(' + self.scale + ')';
        });
    }

    cropImage() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 280;

        canvas.width = size;
        canvas.height = size;

        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size / 2;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.clip();

        const imageX = centerX - (150 * this.scale) + this.offsetX;
        const imageY = centerY - (150 * this.scale) + this.offsetY;
        const imageWidth = 300 * this.scale;
        const imageHeight = 300 * this.scale;

        const tempImg = new Image();
        tempImg.src = this.imageSrc;
        const self = this;

        return new Promise(function(resolve) {
            tempImg.onload = function() {
                ctx.drawImage(tempImg, imageX, imageY, imageWidth, imageHeight);
                resolve(canvas.toDataURL('image/png'));
            };
        });
    }
}

const avatarCropManager = new AvatarCropManager();

// ============== MAIN APP ==============
class VietverseApp {
    constructor() {
        this.initialChat = new InitialChatFlow();
        this.settingsManager = settingsManager;
        this.avatarCropManager = avatarCropManager;
        this.currentFilterDays = 1;
        this.resetPasswordEmail = null;
        this.timerInterval = null;
        this.sessionCheckInterval = null;
        this.lastSessionTouchAt = 0;
        this.chatMissionTick = 0;
        this.streakShopOpen = false;
        this.streakCalendarMonthOffset = 0;
        const savedHistoryPanelState = safeGetItem('historyPanelCollapsed');
        this.historyPanelCollapsed = savedHistoryPanelState === null
            ? window.matchMedia('(max-width: 768px)').matches
            : savedHistoryPanelState === '1';
        this.initializeEventListeners();
        this.initializeSessionTimeoutTracking();
        this.startMissionTrackingTimer();

        if (this.shouldOpenIntroForGuest()) {
            this.openIntroPage();
            return;
        }
        
        if (appState.isAuthenticated) {
            this.ensureGamificationState();
            this.setLandingVisible(false);
            this.goToPage('chat');
        } else {
            const authPageFromUrl = this.getAuthPageFromUrl();
            const authPage = authPageFromUrl || 'login';
            this.switchAuthPage(authPage);
            this.goToPage(authPage);
        }
    }

    getAuthPageFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const auth = String(params.get('auth') || '').trim().toLowerCase();
            if (auth === 'signup') return 'signup';
            if (auth === 'login') return 'login';
        } catch (e) {
            return null;
        }
        return null;
    }

    getNextPageFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const nextPage = String(params.get('next') || '').trim().toLowerCase();
            if (nextPage === 'chat') return 'chat';
        } catch (e) {
            return null;
        }
        return null;
    }

    shouldOpenIntroForGuest() {
        return false; // Không cần intro page
    }

    openIntroPage() {
        // Không cần
    }

    initializeSessionTimeoutTracking() {
        const self = this;
        const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];

        activityEvents.forEach(function(eventName) {
            document.addEventListener(eventName, function() {
                self.recordSessionActivity(false);
            });
        });

        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState !== 'visible') return;
            self.enforceSessionTimeout();
            self.recordSessionActivity(true);
        });

        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
        }

        this.sessionCheckInterval = setInterval(function() {
            self.enforceSessionTimeout();
        }, SESSION_CHECK_INTERVAL_MS);

        this.enforceSessionTimeout();
        this.recordSessionActivity(true);
    }

    recordSessionActivity(force) {
        if (!appState.isAuthenticated) return;

        const now = Date.now();
        if (!force && now - this.lastSessionTouchAt < 10000) {
            return;
        }

        this.lastSessionTouchAt = now;
        appState.setSessionLastActivityAt(now);
    }

    enforceSessionTimeout() {
        if (!appState.isAuthenticated) return;
        if (!appState.isSessionExpired()) return;
        this.handleLogout({ reason: 'timeout' });
    }

    isDemoAccount() {
        return !!(appState.currentUser && isDemoEmail(appState.currentUser.email));
    }

    showDemoFeatureNotice() {
        alert('⚠️ Tài khoản demo không dùng được tính năng này.\n\nBạn tạo tài khoản mới để sử dụng tính năng này.');
    }

    initializeEventListeners() {
        const self = this;

        // Login & Signup
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', function(e) { self.handleLogin(e); });
        }

        const demoQuickLoginBox = document.getElementById('demoQuickLoginBox');
        if (demoQuickLoginBox) {
            demoQuickLoginBox.addEventListener('click', function() {
                self.handleDemoLogin();
            });
            demoQuickLoginBox.addEventListener('keydown', function(e) {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                self.handleDemoLogin();
            });
        }

        const signupForm = document.getElementById('signupForm');
        if (signupForm) {
            signupForm.addEventListener('submit', function(e) { self.handleSignup(e); });
        }

        const switchToSignup = document.getElementById('switchToSignup');
        if (switchToSignup) {
            switchToSignup.addEventListener('click', function(e) {
                e.preventDefault();
                self.switchAuthPage('signup');
            });
        }

        const switchToLogin = document.getElementById('switchToLogin');
        if (switchToLogin) {
            switchToLogin.addEventListener('click', function(e) {
                e.preventDefault();
                self.switchAuthPage('login');
            });
        }

        // Forgot Password
        const forgotPasswordLink = document.getElementById('forgotPasswordLink');
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', function(e) {
                e.preventDefault();
                self.openForgotPasswordModal();
            });
        }

        const backToLoginBtn = document.getElementById('backToLoginBtn');
        if (backToLoginBtn) {
            backToLoginBtn.addEventListener('click', function() {
                self.closeForgotPasswordModal();
            });
        }

        const verifyPinBtn = document.getElementById('verifyPinBtn');
        if (verifyPinBtn) {
            verifyPinBtn.addEventListener('click', function() {
                self.verifyPin();
            });
        }

        const submitResetPasswordBtn = document.getElementById('submitResetPasswordBtn');
        if (submitResetPasswordBtn) {
            submitResetPasswordBtn.addEventListener('click', function() {
                self.submitResetPassword();
            });
        }

        const closeForgotBtn = document.getElementById('closeForgotBtn');
        if (closeForgotBtn) {
            closeForgotBtn.addEventListener('click', function() {
                self.closeForgotPasswordModal();
            });
        }

        // Sidebar & Navigation
        const menuToggle = document.getElementById('menuToggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', function() {
                if (!appState.isAuthenticated) return;
                self.toggleSidebar();
            });
        }

        const closeSidebar = document.getElementById('closeSidebar');
        if (closeSidebar) {
            closeSidebar.addEventListener('click', function() { self.toggleSidebar(); });
        }

        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.addEventListener('click', function() { self.toggleSidebar(); });
        }

        document.querySelectorAll('.menu-item').forEach(function(item) {
            item.addEventListener('click', function(e) {
                document.querySelectorAll('.menu-item').forEach(function(i) { i.classList.remove('active'); });
                e.target.classList.add('active');
                const page = e.target.getAttribute('data-page');
                self.goToPage(page);
            });
        });

        // Profile Menu
        const avatarBtn = document.getElementById('avatarBtn');
        if (avatarBtn) {
            avatarBtn.addEventListener('click', function() {
                if (!appState.isAuthenticated) return;
                const profileMenu = document.getElementById('profileMenu');
                if (profileMenu) profileMenu.classList.toggle('active');
            });
        }

        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', function() {
                document.getElementById('profileMenu').classList.remove('active');
                if (self.isDemoAccount()) {
                    self.showDemoFeatureNotice();
                    return;
                }
                self.goToPage('settings');
                setTimeout(function() { self.initializeSettingsPage(); }, 100);
            });
        }

        const securityBtn = document.getElementById('securityBtn');
        if (securityBtn) {
            securityBtn.addEventListener('click', function() {
                document.getElementById('profileMenu').classList.remove('active');
                if (self.isDemoAccount()) {
                    self.showDemoFeatureNotice();
                    return;
                }
                self.goToPage('security');
                setTimeout(function() { self.initializeSecurityPage(); }, 100);
            });
        }

        const statsBtn = document.getElementById('statsBtn');
        if (statsBtn) {
            statsBtn.addEventListener('click', function() {
                document.getElementById('profileMenu').classList.remove('active');
                self.goToPage('stats');
                setTimeout(function() { self.initializeStatsPage(); }, 100);
            });
        }

        const backFromSettings = document.getElementById('backFromSettings');
        if (backFromSettings) {
            backFromSettings.addEventListener('click', function() { self.goToPage('chat'); });
        }

        const backFromSecurity = document.getElementById('backFromSecurity');
        if (backFromSecurity) {
            backFromSecurity.addEventListener('click', function() {
                self.goToPage('chat');
            });
        }

        const backFromStats = document.getElementById('backFromStats');
        if (backFromStats) {
            backFromStats.addEventListener('click', function() {
                self.goToPage('chat');
            });
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function() {
                self.handleLogout();
            });
        }

        // Chat & Messages
        const sendBtn = document.getElementById('mainSendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', function() {
                self.sendMainMessage();
            });
        }

        const mainChatInput = document.getElementById('mainChatInput');
        if (mainChatInput) {
            mainChatInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') self.sendMainMessage();
            });
        }

        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.addEventListener('click', function(e) {
                const suggestionBtn = e.target.closest('.chat-suggestion-btn');
                if (!suggestionBtn) return;
                const suggestionText = suggestionBtn.getAttribute('data-suggestion') || suggestionBtn.textContent || '';
                self.sendMainMessage(suggestionText);
            });
        }

        // Health Assessment
        document.querySelectorAll('.assessment-item input[type="range"]').forEach(function(input) {
            const defaultValue = parseInt(input.getAttribute('value'), 10);
            const metricKey = input.dataset.metric;
            const inputValue = self.metricInputFromDisplay(metricKey, defaultValue);
            if (!isNaN(inputValue)) {
                input.value = String(inputValue);
            }

            input.addEventListener('input', function(e) {
                const displayId = e.target.dataset.display || (e.target.id + 'Display');
                const display = document.getElementById(displayId);
                const metricKey = e.target.dataset.metric;
                const displayValue = self.metricDisplayFromInput(metricKey, parseInt(e.target.value, 10));
                if (display && !isNaN(displayValue)) display.textContent = displayValue;
                self.updateHealthScorePreviewFromForm();
            });
        });

        document.querySelectorAll('.metric-toggle').forEach(function(toggle) {
            toggle.addEventListener('change', function(e) {
                self.handleMetricToggle(e.target);
                self.updateHealthScorePreviewFromForm();
            });
            self.handleMetricToggle(toggle);
        });
        self.updateHealthScorePreviewFromForm();

        const submitHealthBtn = document.getElementById('submitHealthBtn');
        if (submitHealthBtn) {
            submitHealthBtn.addEventListener('click', function() {
                self.submitHealthAssessment();
            });
        }

        const clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');
        if (clearAllHistoryBtn) {
            clearAllHistoryBtn.addEventListener('click', function() {
                self.clearAllHistory();
            });
        }

        const checkInTodayBtn = document.getElementById('checkInTodayBtn');
        if (checkInTodayBtn) {
            checkInTodayBtn.addEventListener('click', function() {
                self.handleManualCheckIn();
            });
        }

        const streakPrevMonthBtn = document.getElementById('streakPrevMonthBtn');
        if (streakPrevMonthBtn) {
            streakPrevMonthBtn.addEventListener('click', function() {
                self.shiftStreakCalendarMonth(-1);
            });
        }

        const streakNextMonthBtn = document.getElementById('streakNextMonthBtn');
        if (streakNextMonthBtn) {
            streakNextMonthBtn.addEventListener('click', function() {
                self.shiftStreakCalendarMonth(1);
            });
        }

        const toggleShopBtn = document.getElementById('toggleShopBtn');
        if (toggleShopBtn) {
            toggleShopBtn.addEventListener('click', function() {
                self.toggleStreakShop();
            });
        }

        const buyStreakShieldBtn = document.getElementById('buyStreakShieldBtn');
        if (buyStreakShieldBtn) {
            buyStreakShieldBtn.addEventListener('click', function() {
                self.buyShopItem('streakShield');
            });
        }

        const buyHonorBadgeBtn = document.getElementById('buyHonorBadgeBtn');
        if (buyHonorBadgeBtn) {
            buyHonorBadgeBtn.addEventListener('click', function() {
                self.buyShopItem('honorBadge');
            });
        }

        // PIN Management
        const generatePinBtn = document.getElementById('generatePinBtn');
        if (generatePinBtn) {
            generatePinBtn.addEventListener('click', function() {
                self.generateNewPin();
            });
        }

        const viewPinBtn = document.getElementById('viewPinBtn');
        if (viewPinBtn) {
            viewPinBtn.addEventListener('click', function() {
                self.viewPins();
            });
        }

        const closePinDisplayBtn = document.getElementById('closePinDisplayBtn');
        if (closePinDisplayBtn) {
            closePinDisplayBtn.addEventListener('click', function() {
                document.getElementById('pinDisplayModal').classList.remove('active');
            });
        }

        const closePinDisplayBtnBottom = document.getElementById('closePinDisplayBtnBottom');
        if (closePinDisplayBtnBottom) {
            closePinDisplayBtnBottom.addEventListener('click', function() {
                document.getElementById('pinDisplayModal').classList.remove('active');
            });
        }

        // Avatar Upload
        const uploadAvatarBtn = document.getElementById('uploadAvatarBtn');
        if (uploadAvatarBtn) {
            uploadAvatarBtn.addEventListener('click', function() {
                document.getElementById('avatarFileInput').click();
            });
        }

        const avatarFileInput = document.getElementById('avatarFileInput');
        if (avatarFileInput) {
            avatarFileInput.addEventListener('change', function(e) {
                self.handleAvatarUpload(e);
            });
        }

        const confirmCropBtn = document.getElementById('confirmCropBtn');
        if (confirmCropBtn) {
            confirmCropBtn.addEventListener('click', function() {
                self.confirmAvatarCrop();
            });
        }

        const cancelCropBtn = document.getElementById('cancelCropBtn');
        if (cancelCropBtn) {
            cancelCropBtn.addEventListener('click', function() {
                self.avatarCropManager.closeModal();
            });
        }

        const closeCropBtn = document.getElementById('closeCropBtn');
        if (closeCropBtn) {
            closeCropBtn.addEventListener('click', function() {
                self.avatarCropManager.closeModal();
            });
        }

        // Profile Settings
        const updateProfileBtn = document.getElementById('updateProfileBtn');
        if (updateProfileBtn) {
            updateProfileBtn.addEventListener('click', function() {
                self.updateProfile();
            });
        }

        // Password Change
        const updatePasswordBtn = document.getElementById('updatePasswordBtn');
        if (updatePasswordBtn) {
            updatePasswordBtn.addEventListener('click', function() {
                self.updatePassword();
            });
        }

        // Theme & Color
        const themeLight = document.getElementById('themeLight');
        const themeDark = document.getElementById('themeDark');

        if (themeLight) {
            themeLight.addEventListener('change', function() {
                self.setTheme('light');
            });
        }

        if (themeDark) {
            themeDark.addEventListener('change', function() {
                self.setTheme('dark');
            });
        }

        document.querySelectorAll('.color-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const color = this.getAttribute('data-color');
                self.setThemeColor(color, this);
            });
        });
        this.syncPresetColorButtons();

        const customThemeColor = document.getElementById('customThemeColor');
        const customThemeHex = document.getElementById('customThemeHex');
        const applyCustomColorBtn = document.getElementById('applyCustomColorBtn');
        const resetDefaultColorBtn = document.getElementById('resetDefaultColorBtn');

        if (customThemeColor) {
            customThemeColor.addEventListener('input', function() {
                if (customThemeHex) customThemeHex.value = this.value.toUpperCase();
                self.setThemeColor(this.value);
            });
        }

        if (customThemeHex) {
            customThemeHex.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    self.setThemeColor(this.value);
                }
            });
        }

        if (applyCustomColorBtn) {
            applyCustomColorBtn.addEventListener('click', function() {
                if (customThemeHex) self.setThemeColor(customThemeHex.value);
            });
        }

        if (resetDefaultColorBtn) {
            resetDefaultColorBtn.addEventListener('click', function() {
                self.resetThemeDefaults(true);
            });
        }

        // Stats Filter
        document.querySelectorAll('.filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                const days = this.getAttribute('data-days');
                self.currentFilterDays = parseInt(days);
                self.initializeStatsPage();
            });
        });

        // Chat History
        const newChatBtn = document.getElementById('newChatBtn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', function() {
                self.startNewChat();
            });
        }

        const collapseHistoryBtn = document.getElementById('collapseHistoryBtn');
        if (collapseHistoryBtn) {
            collapseHistoryBtn.addEventListener('click', function() {
                self.setHistoryPanelCollapsed(true);
            });
        }

        const expandHistoryBtn = document.getElementById('expandHistoryBtn');
        if (expandHistoryBtn) {
            expandHistoryBtn.addEventListener('click', function() {
                self.setHistoryPanelCollapsed(false);
            });
        }

        document.addEventListener('click', function(e) {
            const profileMenu = document.getElementById('profileMenu');
            const avatarBtn = document.getElementById('avatarBtn');
            if (profileMenu && avatarBtn && !profileMenu.contains(e.target) && !avatarBtn.contains(e.target)) {
                profileMenu.classList.remove('active');
            }
        });
    }

    startMissionTrackingTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        const self = this;
        this.timerInterval = setInterval(function() {
            self.trackChatMissionTick();
        }, 1000);
    }

    ensureGamificationState() {
        if (!appState.isAuthenticated) return;

        appState.gamification = appState.normalizeGamificationState(appState.gamification);
        const missionState = this.ensureDailyMissionState();
        const shopReset = this.ensureWeeklyShopState();

        if (missionState || shopReset) {
            this.updateCoinDisplay();
        }
    }

    getDailyMissionTemplates() {
        return {
            healthMandatory: {
                id: 'health_assessment_once',
                type: 'health_assessment',
                title: 'Đánh giá sức khỏe 1 lần',
                target: 1,
                reward: 3
            },
            rotating: [
                {
                    id: 'chat_for_5_minutes',
                    type: 'chat_seconds',
                    title: 'Nói chuyện với Sao Vàng 5 phút',
                    target: 300,
                    reward: 2
                },
                {
                    id: 'schedule_open_3',
                    type: 'schedule_open',
                    title: 'Xem lịch khóa biểu 3 lần',
                    target: 3,
                    reward: 2
                },
                {
                    id: 'schedule_open_1',
                    type: 'schedule_open',
                    title: 'Xem lịch khóa biểu 1 lần',
                    target: 1,
                    reward: 1
                }
            ]
        };
    }

    buildDailyMissionsForDate() {
        const templates = this.getDailyMissionTemplates();
        const rotatingPool = templates.rotating.slice();

        for (let i = rotatingPool.length - 1; i > 0; i--) {
            const randomIndex = Math.floor(Math.random() * (i + 1));
            const temp = rotatingPool[i];
            rotatingPool[i] = rotatingPool[randomIndex];
            rotatingPool[randomIndex] = temp;
        }

        const selected = rotatingPool.slice(0, 2);
        const allMissions = [templates.healthMandatory].concat(selected);

        return allMissions.map(function(template) {
            return {
                id: template.id,
                type: template.type,
                title: template.title,
                target: template.target,
                progress: 0,
                reward: template.reward,
                completed: false,
                rewardClaimed: false
            };
        });
    }

    settleMissionRewards(missionState) {
        if (!missionState || !Array.isArray(missionState.missions)) {
            return { changed: false, gainedCoins: 0 };
        }

        let changed = false;
        let gainedCoins = 0;

        missionState.missions.forEach(function(mission) {
            const target = Math.max(1, parseInt(mission.target, 10) || 1);
            const normalizedProgress = Math.max(0, Math.min(target, parseInt(mission.progress, 10) || 0));

            if (target !== mission.target) {
                mission.target = target;
                changed = true;
            }

            if (normalizedProgress !== mission.progress) {
                mission.progress = normalizedProgress;
                changed = true;
            }

            const shouldComplete = mission.progress >= mission.target;
            if (shouldComplete !== !!mission.completed) {
                mission.completed = shouldComplete;
                changed = true;
            }

            if (mission.completed && !mission.rewardClaimed) {
                mission.rewardClaimed = true;
                gainedCoins += Math.max(0, parseInt(mission.reward, 10) || 0);
                changed = true;
            }
        });

        if (gainedCoins > 0) {
            appState.gamification.coins = Math.max(0, parseInt(appState.gamification.coins, 10) || 0) + gainedCoins;
            changed = true;
        }

        return { changed: changed, gainedCoins: gainedCoins };
    }

    ensureDailyMissionState() {
        if (!appState.isAuthenticated) return null;

        appState.gamification = appState.normalizeGamificationState(appState.gamification);
        const todayKey = this.getTodayDateKey();
        const missionState = appState.gamification.dailyMissions || {};
        const missions = Array.isArray(missionState.missions) ? missionState.missions : [];
        const hasMandatoryMission = missions.some(function(mission) {
            return mission && mission.id === 'health_assessment_once';
        });

        let changed = false;

        if (missionState.dateKey !== todayKey || missions.length !== 3 || !hasMandatoryMission) {
            appState.gamification.dailyMissions = {
                dateKey: todayKey,
                missions: this.buildDailyMissionsForDate(todayKey),
                chatSeconds: 0
            };
            changed = true;
        }

        const activeState = appState.gamification.dailyMissions;
        activeState.chatSeconds = Math.max(0, parseInt(activeState.chatSeconds, 10) || 0);
        activeState.missions.forEach(function(mission) {
            if (mission.type === 'chat_seconds') {
                const nextProgress = Math.min(mission.target, activeState.chatSeconds);
                if (nextProgress !== mission.progress) {
                    mission.progress = nextProgress;
                    changed = true;
                }
            }
        });

        const settled = this.settleMissionRewards(activeState);
        if (settled.changed) changed = true;

        if (changed) {
            appState.saveGamificationState();
        }

        return activeState;
    }

    updateMissionProgress(missionType, amount, options) {
        if (!appState.isAuthenticated) return 0;

        const config = options || {};
        const increment = Math.max(0, parseInt(amount, 10) || 0);
        if (increment <= 0) return 0;

        const missionState = this.ensureDailyMissionState();
        if (!missionState || !Array.isArray(missionState.missions)) return 0;

        let changed = false;

        if (missionType === 'chat_seconds') {
            const maxChatTarget = missionState.missions.reduce(function(maxValue, mission) {
                if (mission.type !== 'chat_seconds') return maxValue;
                return Math.max(maxValue, Math.max(1, parseInt(mission.target, 10) || 1));
            }, 0);
            if (maxChatTarget <= 0) {
                return 0;
            }

            const nextSeconds = Math.min(maxChatTarget, missionState.chatSeconds + increment);
            if (nextSeconds !== missionState.chatSeconds) {
                missionState.chatSeconds = nextSeconds;
                changed = true;
            }
        }

        missionState.missions.forEach(function(mission) {
            if (mission.type !== missionType) return;

            const target = Math.max(1, parseInt(mission.target, 10) || 1);
            const current = Math.max(0, parseInt(mission.progress, 10) || 0);
            const nextProgress = missionType === 'chat_seconds'
                ? Math.min(target, missionState.chatSeconds)
                : Math.min(target, current + increment);

            if (nextProgress !== current) {
                mission.progress = nextProgress;
                changed = true;
            }
        });

        const settled = this.settleMissionRewards(missionState);
        if (settled.changed) changed = true;

        if (changed) {
            appState.saveGamificationState();
        }

        if (changed && !config.skipRender) {
            this.renderDailyMissions();
            this.renderShopState();
        } else if (settled.gainedCoins > 0) {
            this.renderDailyMissions();
            this.renderShopState();
        }

        return settled.gainedCoins;
    }

    trackChatMissionTick() {
        if (!appState.isAuthenticated) {
            this.chatMissionTick = 0;
            return;
        }

        if (document.hidden || appState.currentPage !== 'chat') {
            this.chatMissionTick = 0;
            return;
        }

        this.chatMissionTick += 1;
        this.updateMissionProgress('chat_seconds', 1, { skipRender: true });

        if (this.chatMissionTick % 5 === 0) {
            this.renderDailyMissions();
        }
    }

    renderDailyMissions() {
        const missionList = document.getElementById('dailyMissionList');
        const missionDateLabel = document.getElementById('missionDateLabel');
        if (!missionList && !missionDateLabel) return;

        if (!appState.isAuthenticated) {
            if (missionList) {
                missionList.innerHTML = '<div class="stats-empty">Đăng nhập để theo dõi nhiệm vụ.</div>';
            }
            if (missionDateLabel) missionDateLabel.textContent = '';
            return;
        }

        const missionState = this.ensureDailyMissionState();
        if (!missionState) return;

        if (missionDateLabel) {
            const dateParts = missionState.dateKey.split('-');
            if (dateParts.length === 3) {
                missionDateLabel.textContent = 'Hôm nay: ' + dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0];
            } else {
                missionDateLabel.textContent = '';
            }
        }

        if (!missionList) return;

        if (!missionState.missions || missionState.missions.length === 0) {
            missionList.innerHTML = '<div class="stats-empty">Chưa có nhiệm vụ cho hôm nay.</div>';
            return;
        }

        missionList.innerHTML = missionState.missions.map(function(mission) {
            const progress = Math.max(0, parseInt(mission.progress, 10) || 0);
            const target = Math.max(1, parseInt(mission.target, 10) || 1);
            const percent = Math.max(0, Math.min(100, (progress / target) * 100));
            const done = !!mission.completed;
            const doneLabel = done ? '✅ Hoàn thành' : '⏳ Đang thực hiện';

            return '<div class="daily-mission-item' + (done ? ' done' : '') + '">' +
                '<div class="daily-mission-top">' +
                '<span class="daily-mission-title">' + mission.title + '</span>' +
                '<span class="daily-mission-reward">+' + mission.reward + ' 🪙</span>' +
                '</div>' +
                '<div class="daily-mission-progress">' +
                '<span>' + progress + '/' + target + '</span>' +
                '<div class="daily-mission-bar"><span style="width:' + percent.toFixed(1) + '%;"></span></div>' +
                '<span>' + doneLabel + '</span>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    getCurrentWeekKey(referenceDate) {
        const date = new Date(referenceDate || Date.now());
        date.setHours(0, 0, 0, 0);

        const day = (date.getDay() + 6) % 7;
        date.setDate(date.getDate() - day + 3);
        const firstThursday = new Date(date.getFullYear(), 0, 4);
        const firstThursdayDay = (firstThursday.getDay() + 6) % 7;
        firstThursday.setDate(firstThursday.getDate() - firstThursdayDay + 3);

        const weekNo = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
        return date.getFullYear() + '-W' + String(weekNo).padStart(2, '0');
    }

    getNextShopResetDate(referenceDate) {
        const date = new Date(referenceDate || Date.now());
        date.setHours(0, 0, 0, 0);
        const day = (date.getDay() + 6) % 7;
        const nextReset = new Date(date);
        nextReset.setDate(date.getDate() + (7 - day));
        return nextReset;
    }

    ensureWeeklyShopState() {
        if (!appState.isAuthenticated) return false;

        appState.gamification = appState.normalizeGamificationState(appState.gamification);
        const weekKey = this.getCurrentWeekKey(new Date());
        const weekly = appState.gamification.shopWeeklySales || { weekKey: '', purchases: {} };
        const purchases = weekly.purchases && typeof weekly.purchases === 'object' ? weekly.purchases : {};

        appState.gamification.shopWeeklySales = {
            weekKey: weekly.weekKey || '',
            purchases: purchases
        };

        if (weekly.weekKey === weekKey) {
            return false;
        }

        appState.gamification.shopWeeklySales = {
            weekKey: weekKey,
            purchases: {}
        };
        appState.saveGamificationState();
        return true;
    }

    getShopCatalog() {
        return {
            streakShield: {
                title: 'Đóng băng chuỗi',
                price: 10,
                weeklyLimit: 1,
                inventoryKey: 'streakShield'
            },
            honorBadge: {
                title: 'Huy hiệu danh dự',
                price: 30,
                weeklyLimit: 1,
                inventoryKey: 'honorBadge'
            }
        };
    }

    toggleStreakShop(forceOpen) {
        const shopCard = document.getElementById('streakShopCard');
        const toggleShopBtn = document.getElementById('toggleShopBtn');
        if (!shopCard) return;

        if (typeof forceOpen === 'boolean') {
            this.streakShopOpen = forceOpen;
        } else {
            this.streakShopOpen = !this.streakShopOpen;
        }

        shopCard.classList.toggle('hidden', !this.streakShopOpen);
        if (toggleShopBtn) {
            toggleShopBtn.textContent = this.streakShopOpen ? '❌ Đóng cửa hàng' : '🛒 Vào cửa hàng';
        }

        if (this.streakShopOpen) {
            this.renderShopState();
        }
    }

    updateCoinDisplay() {
        const coinBalance = document.getElementById('coinBalance');
        if (coinBalance) {
            coinBalance.textContent = String(Math.max(0, parseInt(appState.gamification.coins, 10) || 0));
        }
    }

    renderShopState() {
        const shopCard = document.getElementById('streakShopCard');
        if (!shopCard) return;

        if (!appState.isAuthenticated) {
            this.updateCoinDisplay();
            return;
        }

        this.ensureWeeklyShopState();
        appState.gamification = appState.normalizeGamificationState(appState.gamification);
        this.updateCoinDisplay();

        const inventory = appState.gamification.shopInventory || {};
        const weekly = appState.gamification.shopWeeklySales || { purchases: {} };
        const purchases = weekly.purchases || {};
        const coins = Math.max(0, parseInt(appState.gamification.coins, 10) || 0);
        const catalog = this.getShopCatalog();

        const shieldOwned = document.getElementById('shopShieldOwned');
        if (shieldOwned) shieldOwned.textContent = String(Math.max(0, parseInt(inventory.streakShield, 10) || 0));

        const honorOwned = document.getElementById('shopHonorBadgeOwned');
        if (honorOwned) honorOwned.textContent = String(Math.max(0, parseInt(inventory.honorBadge, 10) || 0));

        const shopResetInfo = document.getElementById('shopResetInfo');
        if (shopResetInfo) {
            const resetDate = this.getNextShopResetDate(new Date());
            shopResetInfo.textContent = 'Reset: ' + resetDate.toLocaleDateString('vi-VN');
        }

        const setButtonState = function(buttonId, itemKey) {
            const button = document.getElementById(buttonId);
            if (!button) return;

            const item = catalog[itemKey];
            if (!item) return;

            const bought = Math.max(0, parseInt(purchases[itemKey], 10) || 0);
            const soldOut = bought >= item.weeklyLimit;
            const enoughCoin = coins >= item.price;

            button.disabled = soldOut || !enoughCoin;
            if (soldOut) {
                button.textContent = 'Hết lượt tuần này';
            } else {
                button.textContent = item.price + ' 🪙';
            }
        };

        setButtonState('buyStreakShieldBtn', 'streakShield');
        setButtonState('buyHonorBadgeBtn', 'honorBadge');
    }

    buyShopItem(itemKey) {
        if (!appState.isAuthenticated) return;

        this.ensureGamificationState();
        this.ensureWeeklyShopState();

        const catalog = this.getShopCatalog();
        const item = catalog[itemKey];
        if (!item) return;

        const purchases = appState.gamification.shopWeeklySales.purchases || {};
        const bought = Math.max(0, parseInt(purchases[itemKey], 10) || 0);

        if (bought >= item.weeklyLimit) {
            alert('🛒 Món này đã hết lượt mua trong tuần, hãy chờ reset tuần sau.');
            this.renderShopState();
            return;
        }

        const currentCoins = Math.max(0, parseInt(appState.gamification.coins, 10) || 0);
        if (currentCoins < item.price) {
            alert('🪙 Bạn chưa đủ xu để mua món này.');
            this.renderShopState();
            return;
        }

        appState.gamification.coins = currentCoins - item.price;
        purchases[itemKey] = bought + 1;
        appState.gamification.shopWeeklySales.purchases = purchases;
        let unlockedHonorBadgeAchievement = false;

        if (item.inventoryKey) {
            const inventory = appState.gamification.shopInventory || {};
            const currentOwned = Math.max(0, parseInt(inventory[item.inventoryKey], 10) || 0);
            inventory[item.inventoryKey] = currentOwned + 1;
            if (itemKey === 'honorBadge' && currentOwned === 0) {
                unlockedHonorBadgeAchievement = true;
            }
            appState.gamification.shopInventory = inventory;
        }

        appState.saveGamificationState();
        this.renderShopState();
        this.renderDailyMissions();

        if (itemKey === 'honorBadge' && unlockedHonorBadgeAchievement) {
            alert('🏅 Đã mua thành công: ' + item.title + '. Thành tựu "Nhà sưu tầm" đã mở khóa.');
        } else {
            alert('✅ Đã mua thành công: ' + item.title + '.');
        }

        this.updateStreakDisplay();
    }

    getShieldDateSet() {
        const shieldDates = Array.isArray(appState.gamification.streakShieldUsedDates)
            ? appState.gamification.streakShieldUsedDates
            : [];
        return new Set(shieldDates);
    }

    tryAutoUseStreakShield(dateSet, today) {
        if (!appState.isAuthenticated) return '';
        if (!dateSet || typeof dateSet.has !== 'function') return '';

        this.ensureGamificationState();
        const inventory = appState.gamification.shopInventory || {};
        const availableShield = Math.max(0, parseInt(inventory.streakShield, 10) || 0);
        if (availableShield <= 0) return '';

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        const yesterdayKey = this.formatDateKey(yesterday);
        const twoDaysAgoKey = this.formatDateKey(twoDaysAgo);

        if (dateSet.has(yesterdayKey)) return '';
        if (!dateSet.has(twoDaysAgoKey)) return '';

        inventory.streakShield = availableShield - 1;
        appState.gamification.shopInventory = inventory;

        const usedDates = Array.isArray(appState.gamification.streakShieldUsedDates)
            ? appState.gamification.streakShieldUsedDates.slice()
            : [];

        if (usedDates.indexOf(yesterdayKey) === -1) {
            usedDates.push(yesterdayKey);
        }

        appState.gamification.streakShieldUsedDates = usedDates;
        appState.saveGamificationState();
        dateSet.add(yesterdayKey);
        return yesterdayKey;
    }

    // ============== LOGIN & AUTH METHODS ==============
    openForgotPasswordModal() {
        const modal = document.getElementById('forgotPasswordModal');
        if (modal) {
            modal.classList.add('active');
            document.getElementById('forgotPinInput').value = '';
            document.getElementById('pinVerifySection').style.display = 'block';
            document.getElementById('resetPasswordSection').style.display = 'none';
        }
    }

    closeForgotPasswordModal() {
        const modal = document.getElementById('forgotPasswordModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    verifyPin() {
        const pinInput = document.getElementById('forgotPinInput').value.trim();

        if (!pinInput) {
            alert('❌ Vui lòng nhập Mã PIN!');
            return;
        }

        const usersRaw = safeGetJson('users', []);
        const users = Array.isArray(usersRaw) ? usersRaw : [];
        let found = false;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            if (pinManager.loadPins(user.email)) {
                if (pinManager.verifyPin(pinInput)) {
                    this.resetPasswordEmail = user.email;
                    found = true;
                    break;
                }
            }
        }

        if (found) {
            document.getElementById('pinVerifySection').style.display = 'none';
            document.getElementById('resetPasswordSection').style.display = 'block';
            alert('✅ Mã PIN đúng! Hãy đặt mật khẩu mới.');
        } else {
            alert('❌ Mã PIN không đúng hoặc đã được sử dụng!');
        }
    }

    submitResetPassword() {
        const newPassword = document.getElementById('newPasswordReset').value;
        const confirmPassword = document.getElementById('confirmPasswordReset').value;

        if (!newPassword || !confirmPassword) {
            alert('❌ Vui lòng điền đầy đủ!');
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('❌ Mật khẩu không trùng khớp!');
            return;
        }

        if (newPassword.length < 6) {
            alert('❌ Mật khẩu phải 6+ ký tự!');
            return;
        }

        const usersRaw = safeGetJson('users', []);
        const users = Array.isArray(usersRaw) ? usersRaw : [];
        const userIdx = users.findIndex(function(u) { return u.email === this.resetPasswordEmail; }.bind(this));

        if (userIdx !== -1) {
            users[userIdx].password = newPassword;
            safeSetJson('users', users);
            alert('✅ Mật khẩu đã cập nhật! Hãy đăng nhập lại.');
            this.closeForgotPasswordModal();
            this.switchAuthPage('login');
        }
    }

    loginWithCredentials(email, password, showError) {
        const usersRaw = safeGetJson('users', []);
        const users = Array.isArray(usersRaw) ? usersRaw : [];
        const normalizedEmail = (email || '').trim().toLowerCase();
        const user = users.find(function(u) {
            return String(u.email || '').trim().toLowerCase() === normalizedEmail && u.password === password;
        });

        if (user) {
            appState.currentUser = user;
            appState.isAuthenticated = true;
            appState.loadDailyCheckIns();
            appState.loadGamificationState();
            appState.touchSessionActivity();
            appState.saveToLocalStorage();
            settingsManager.loadSettings();
            pinManager.loadPins(user.email);
            chatHistoryManager.loadHistories(user.email);
            this.updateHistoryList();

            const userNameEl = document.getElementById('userName');
            const userEmailEl = document.getElementById('userEmail');
            if (userNameEl) userNameEl.textContent = user.name;
            if (userEmailEl) userEmailEl.textContent = user.email;
            this.streakShopOpen = false;
            this.toggleStreakShop(false);
            this.startNewChat();
            return true;
        } else {
            if (showError !== false) {
                alert('❌ Email hoặc mật khẩu không chính xác!');
            }
            return false;
        }
    }

    handleDemoLogin() {
        const demoEmail = DEMO_EMAIL;
        const demoPassword = '123456';
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');

        if (emailInput) emailInput.value = demoEmail;
        if (passwordInput) passwordInput.value = demoPassword;

        this.loginWithCredentials(demoEmail, demoPassword, false);
    }

    handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            alert('❌ Vui lòng điền email và mật khẩu!');
            return;
        }

        this.loginWithCredentials(email, password, true);
    }

    handleSignup(e) {
        e.preventDefault();
        const name = document.getElementById('signupName').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;
        const confirm = document.getElementById('signupConfirm').value;

        if (!name || !email || !password || !confirm) {
            alert('❌ Vui lòng điền đầy đủ!');
            return;
        }

        if (password !== confirm) {
            alert('❌ Mật khẩu không trùng khớp!');
            return;
        }

        if (password.length < 6) {
            alert('❌ Mật khẩu phải 6+ ký tự!');
            return;
        }

        const usersRaw = safeGetJson('users', []);
        const users = Array.isArray(usersRaw) ? usersRaw : [];
        if (users.some(function(u) { return u.email === email; })) {
            alert('❌ Email đã được dùng!');
            return;
        }

        const newUser = { id: Date.now(), name: name, email: email, password: password };
        users.push(newUser);
        safeSetJson('users', users);

        const newUserSettingsKey = settingsManager.buildSettingsKeyByEmail(email);
        const existingNewUserSettings = safeGetJson(newUserSettingsKey, null);
        if (!existingNewUserSettings || typeof existingNewUserSettings !== 'object') {
            safeSetJson(newUserSettingsKey, settingsManager.getDefaultSettings());
        }

        document.getElementById('signupName').value = '';
        document.getElementById('signupEmail').value = '';
        document.getElementById('signupPassword').value = '';
        document.getElementById('signupConfirm').value = '';

        const successMsg = document.getElementById('signupSuccess');
        if (successMsg) {
            successMsg.style.display = 'block';
            const self = this;
            setTimeout(function() {
                successMsg.style.display = 'none';
                self.switchAuthPage('login');
            }, 2000);
        }
    }

    handleLogout(options) {
        const reason = options && typeof options === 'object' ? options.reason : null;
        appState.isAuthenticated = false;
        appState.currentUser = null;
        appState.dailyCheckIns = [];
        appState.gamification = appState.getDefaultGamificationState();
        this.streakShopOpen = false;
        this.toggleStreakShop(false);
        safeRemoveItem('currentUser');
        appState.clearSessionActivity();
        settingsManager.loadSettings();
        chatHistoryManager.loadHistories(null);
        this.updateHistoryList();
        this.setAuthUIState(false);

        if (reason === 'timeout') {
            alert('🔒 Phiên đăng nhập đã hết hạn do không hoạt động trong 1 giờ. Vui lòng đăng nhập lại.');
        }

        const authPageFromUrl = this.getAuthPageFromUrl();
        const authPage = authPageFromUrl || 'login';
        this.switchAuthPage(authPage);
        this.goToPage(authPage);
    }

    showInitialChat() {
        this.goToPage('initialChat');
        this.initialChat.startFlow();
    }

    switchAuthPage(page) {
        const loginPage = document.getElementById('loginPage');
        const signupPage = document.getElementById('signupPage');

        if (page === 'signup') {
            if (loginPage) loginPage.classList.remove('active');
            if (signupPage) signupPage.classList.add('active');
        } else {
            if (signupPage) signupPage.classList.remove('active');
            if (loginPage) loginPage.classList.add('active');
        }
    }

    setLandingVisible(visible) {
        // Không cần
    }

    setHistoryPanelVisible(visible) {
        document.body.classList.toggle('history-panel-visible', !!visible);
        if (!visible) {
            document.body.classList.remove('history-panel-collapsed');
            return;
        }
        document.body.classList.toggle('history-panel-collapsed', !!this.historyPanelCollapsed);
    }

    setAuthUIState(isAuthenticated) {
        document.body.classList.toggle('unauthenticated', !isAuthenticated);
        if (!isAuthenticated) {
            const profileMenu = document.getElementById('profileMenu');
            if (profileMenu) profileMenu.classList.remove('active');
            this.toggleSidebar(false);
        }
    }

    setHistoryPanelCollapsed(collapsed) {
        this.historyPanelCollapsed = !!collapsed;
        safeSetItem('historyPanelCollapsed', this.historyPanelCollapsed ? '1' : '0');
        if (document.body.classList.contains('history-panel-visible')) {
            document.body.classList.toggle('history-panel-collapsed', this.historyPanelCollapsed);
        }
    }

    // ============== PAGE NAVIGATION ==============
    goToPage(pageName) {
        if ((pageName === 'settings' || pageName === 'security') && this.isDemoAccount()) {
            this.showDemoFeatureNotice();
            pageName = 'chat';
        }

        appState.currentPage = pageName;
        document.querySelectorAll('.page').forEach(function(page) { page.classList.remove('active'); });

        let pageId = '';
        switch(pageName) {
            case 'chat': pageId = 'chatPage'; break;
            case 'schedule': pageId = 'schedulePage'; break;
            case 'health': pageId = 'healthPage'; break;
            case 'streak': pageId = 'streakPage'; break;
            case 'initialChat': pageId = 'initialChatPage'; break;
            case 'login': pageId = 'loginPage'; break;
            case 'signup': pageId = 'signupPage'; break;
            case 'settings': pageId = 'settingsPage'; break;
            case 'security': pageId = 'securityPage'; break;
            case 'stats': pageId = 'statsPage'; break;
        }

        if (pageId) {
            const page = document.getElementById(pageId);
            if (page) page.classList.add('active');
        }

        if (pageName !== 'login' && pageName !== 'signup' && pageName !== 'initialChat' && pageName !== 'settings' && pageName !== 'security') {
            this.toggleSidebar(false);
            document.querySelectorAll('.menu-item').forEach(function(item) {
                item.classList.remove('active');
                if (item.getAttribute('data-page') === pageName) {
                    item.classList.add('active');
                }
            });
        }

        if (pageName === 'schedule') {
            this.generateSchedule();
            this.updateMissionProgress('schedule_open', 1, { skipRender: true });
        } else if (pageName === 'health') {
            this.updateHealthDisplay();
        } else if (pageName === 'streak') {
            this.streakCalendarMonthOffset = 0;
            this.updateStreakDisplay();
        } else if (pageName === 'stats') {
            this.initializeStatsPage();
        }

        const shouldShowHistoryPanel = appState.isAuthenticated && pageName !== 'login' && pageName !== 'signup';
        this.setHistoryPanelVisible(shouldShowHistoryPanel);
        document.body.classList.remove('chat-fullscreen');
        this.setAuthUIState(appState.isAuthenticated);
    }

    toggleSidebar(force) {
        if (!appState.isAuthenticated && force !== false) return;

        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');

        if (sidebar && overlay) {
            if (force !== null && force !== undefined) {
                if (force) {
                    sidebar.classList.add('active');
                    overlay.classList.add('active');
                } else {
                    sidebar.classList.remove('active');
                    overlay.classList.remove('active');
                }
            } else {
                sidebar.classList.toggle('active');
                overlay.classList.toggle('active');
            }
        }
    }

    // ============== CHAT METHODS ==============
    getChatSuggestionPool() {
        return [
            'Vua Hùng có công lao gì trong lịch sử dân tộc?',
            'Ý nghĩa của chiến thắng Bạch Đằng năm 938?',
            'Tìm hiểu về nguồn gốc và ý nghĩa của áo dài Việt Nam?',
            'Phong tục ngày Tết Nguyên Đán có từ bao giờ?',
            'Phở Hà Nội và phở Sài Gòn khác nhau như thế nào?',
            'Lịch sử xây dựng Văn Miếu - Quốc Tử Giám?',
            'Trần Hưng Đạo có vai trò gì trong lịch sử chống giặc ngoại xâm?',
            'Truyền thuyết bánh chưng, bánh giày kể về điều gì?',
            'Tầm quan trọng của chiến dịch Điện Biên Phủ?',
            'Ca trù - Di sản văn hóa phi vật thể của Việt Nam?',
            'Các quốc hiệu của Việt Nam qua các thời kỳ lịch sử?',
            'Chùa Hương có những nét đặc sắc gì về văn hóa tâm linh?',
            'Sự kiện Lý Thái Tổ dời đô về Thăng Long có ý nghĩa gì?',
            'Nghệ thuật múa rối nước độc đáo của người Việt?',
            'Trống đồng Đông Sơn - Biểu tượng văn hóa thời kỳ nào?',
            'Tết Trung Thu có ý nghĩa gì với trẻ em Việt Nam?',
            'Chiến thắng Rạch Gầm - Xoài Mút do ai lãnh đạo?',
            'Nón lá Việt Nam có từ bao giờ và ý nghĩa ra sao?',
            'Chiến công hiển hách của vua Quang Trung đại phá quân Thanh?',
            'Làng gốm Bát Tràng nổi tiếng với những sản phẩm gì?'
        ];
    }

    getRandomSuggestionList(limit) {
        const pool = this.getChatSuggestionPool().slice();
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = pool[i];
            pool[i] = pool[j];
            pool[j] = temp;
        }
        return pool.slice(0, Math.max(1, limit || 6));
    }

    getChatSuggestionList() {
        return this.getRandomSuggestionList(4);
    }

    getDefaultChatMarkup() {
        const greeting = '<div class="chat-bubble ai"><p>👋 Xin chào! Tôi là Sao Vàng, chuyên gia về lịch sử và văn hóa Việt Nam. Bạn muốn tìm hiểu về điều gì?</p></div>';
        const suggestions = this.getChatSuggestionList().map(function(text) {
            const escaped = aiEngine.escapeHtml(text);
            return '<button class="chat-suggestion-btn" data-suggestion="' + escaped + '">' + escaped + '</button>';
        }).join('');
        return greeting + '<div class="chat-suggestions" id="chatSuggestions">' + suggestions + '</div>';
    }

    removeChatSuggestions() {
        const suggestions = document.getElementById('chatSuggestions');
        if (suggestions) suggestions.remove();
    }

    showAiTypingIndicator(chatMessages) {
        if (!chatMessages) return null;
        const typingBubble = document.createElement('div');
        typingBubble.className = 'chat-bubble ai typing';
        typingBubble.innerHTML =
            '<p><span class="typing-dots" aria-label="AI đang phản hồi">' +
            '<span class="typing-dot"></span>' +
            '<span class="typing-dot"></span>' +
            '<span class="typing-dot"></span>' +
            '</span></p>';
        chatMessages.appendChild(typingBubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return typingBubble;
    }

    hideAiTypingIndicator(typingBubble) {
        if (typingBubble && typingBubble.parentNode) {
            typingBubble.parentNode.removeChild(typingBubble);
        }
    }

    sendMainMessage(quickMessage) {
        const input = document.getElementById('mainChatInput');
        const message = typeof quickMessage === 'string'
            ? quickMessage.trim()
            : (input ? input.value.trim() : '');

        if (message) {
            this.removeChatSuggestions();
            this.checkInToday('chat', { skipRender: true });
            const healthDraftResult = this.tryPrepareHealthDraftFromMessage(message);
            chatHistoryManager.addMessage(message, true);
            this.updateHistoryList();
            const chatMessages = document.getElementById('chatMessages');

            const userBubble = document.createElement('div');
            userBubble.className = 'chat-bubble user';
            userBubble.innerHTML = '<p>' + aiEngine.escapeHtml(message) + '</p>';
            chatMessages.appendChild(userBubble);

            if (input) input.value = '';

            const typingBubble = this.showAiTypingIndicator(chatMessages);
            const self = this;

            setTimeout(async function() {
                try {
                    const aiResponse = healthDraftResult ? healthDraftResult.reply : await aiEngine.generateResponseAsync(message);
                    chatHistoryManager.addMessage(aiResponse, false);
                    app.updateHistoryList();

                    self.hideAiTypingIndicator(typingBubble);
                    const aiBubble = document.createElement('div');
                    aiBubble.className = 'chat-bubble ai';
                    aiBubble.innerHTML = '<p>' + aiResponse + '</p>';
                    chatMessages.appendChild(aiBubble);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } catch (err) {
                    debugWarn('sendMainMessage failed:', err);
                    const fallbackResponse = aiEngine.generateResponse(message);
                    chatHistoryManager.addMessage(fallbackResponse, false);
                    app.updateHistoryList();
                    self.hideAiTypingIndicator(typingBubble);
                    const aiBubble = document.createElement('div');
                    aiBubble.className = 'chat-bubble ai';
                    aiBubble.innerHTML = '<p>' + fallbackResponse + '</p>';
                    chatMessages.appendChild(aiBubble);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } finally {
                    self.hideAiTypingIndicator(typingBubble);
                }
            }, 800);

            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    normalizeText(text) {
        return (text || '')
            .toLowerCase()
            .replace(/[đĐ]/g, 'd')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    tryPrepareHealthDraftFromMessage(message) {
        return null; // Không cần cho Vietverse
    }

    getHealthMetricConfigs() {
        return [
            { key: 'energy', inputId: 'energyLevel', displayId: 'energyDisplay', invert: false, icon: '💪', label: 'Năng Lượng' },
            { key: 'sleep', inputId: 'sleepQuality', displayId: 'sleepDisplay', invert: false, icon: '😴', label: 'Giấc Ngủ' },
            { key: 'mood', inputId: 'mood', displayId: 'moodDisplay', invert: false, icon: '😊', label: 'Tâm Trạng' },
            { key: 'stress', inputId: 'stress', displayId: 'stressDisplay', invert: false, icon: '😌', label: 'Thư Giãn' },
            { key: 'hunger', inputId: 'hunger', displayId: 'hungerDisplay', invert: false, icon: '🍽️', label: 'Cơn Đói' }
        ];
    }

    getHealthMetricConfig(metricKey) {
        return this.getHealthMetricConfigs().find(function(metric) {
            return metric.key === metricKey;
        }) || null;
    }

    metricDisplayFromInput(metricKey, inputValue) {
        const n = Number(inputValue);
        if (!isFinite(n)) return NaN;
        return Math.max(1, Math.min(10, n));
    }

    metricInputFromDisplay(metricKey, displayValue) {
        const n = Number(displayValue);
        if (!isFinite(n)) return NaN;
        return Math.max(1, Math.min(10, n));
    }

    getHealthFormValues() {
        return {
            energy: this.metricDisplayFromInput('energy', parseInt(document.getElementById('energyLevel').value, 10)),
            sleep: this.metricDisplayFromInput('sleep', parseInt(document.getElementById('sleepQuality').value, 10)),
            mood: this.metricDisplayFromInput('mood', parseInt(document.getElementById('mood').value, 10)),
            stress: this.metricDisplayFromInput('stress', parseInt(document.getElementById('stress').value, 10)),
            hunger: this.metricDisplayFromInput('hunger', parseInt(document.getElementById('hunger').value, 10))
        };
    }

    getEnabledHealthMetrics() {
        const enabled = {};
        const metricConfigs = this.getHealthMetricConfigs();
        metricConfigs.forEach(function(metric) {
            const toggle = document.querySelector('.metric-toggle[data-metric="' + metric.key + '"]');
            enabled[metric.key] = toggle ? toggle.checked : true;
        });
        return enabled;
    }

    calculateHealthScore(values, enabledMap) {
        const metricConfigs = this.getHealthMetricConfigs();
        let total = 0;
        let count = 0;

        metricConfigs.forEach(function(metric) {
            if (enabledMap && enabledMap[metric.key] === false) return;

            const raw = Number(values[metric.key]);
            if (!isFinite(raw)) return;

            const normalized = Math.max(1, Math.min(10, metric.invert ? (11 - raw) : raw));
            total += normalized;
            count += 1;
        });

        if (count === 0) return null;
        return Math.round((total / count) * 10);
    }

    updateHealthScorePreviewFromForm() {
        const values = this.getHealthFormValues();
        const enabledMap = this.getEnabledHealthMetrics();
        const score = this.calculateHealthScore(values, enabledMap);

        const scoreEl = document.getElementById('wellBeingScore');
        if (scoreEl) scoreEl.textContent = score === null ? '0' : score;

        const statusEl = document.getElementById('scoreStatus');
        if (!statusEl) return;
        if (score === null) {
            statusEl.textContent = '⚠️ Hãy bật ít nhất 1 mục để chấm điểm.';
            return;
        }

        let status = '😊 Tuyệt vời!';
        if (score < 50) status = '😔 Cần cải thiện';
        else if (score < 70) status = '😐 Bình thường';
        statusEl.textContent = status + ' (' + score + '/100)';
    }

    handleMetricToggle(toggle) {
        if (!toggle) return;
        const metricKey = toggle.dataset.metric;
        const rangeInput = document.querySelector('.assessment-item input[type="range"][data-metric="' + metricKey + '"]');
        if (!rangeInput) return;

        const isEnabled = !!toggle.checked;
        rangeInput.disabled = !isEnabled;

        const displayId = rangeInput.dataset.display || (rangeInput.id + 'Display');
        const display = document.getElementById(displayId);

        const assessmentItem = rangeInput.closest('.assessment-item');
        if (assessmentItem) assessmentItem.classList.toggle('disabled', !isEnabled);

        if (display) {
            display.classList.toggle('value-display-disabled', !isEnabled);
            const shown = this.metricDisplayFromInput(metricKey, parseInt(rangeInput.value, 10));
            display.textContent = isEnabled && !isNaN(shown) ? shown : 'Tắt';
        }
    }

    applyHealthDraftToForm(draft) {
        // Không cần cho Vietverse
    }

    // ============== SCHEDULE METHODS ==============
    generateSchedule() {
        const schedule = [];
        const pref = appState.initialHealthData.preferences || '';

        schedule.push({
            time: '7:00 AM - 8:00 AM',
            emoji: '🥣',
            title: 'Bữa Sáng',
            suggestion: 'Cháo yến mạch + Trái cây + Sữa chua'
        });

        if (pref.includes('sáng')) {
            schedule.push({
                time: '8:00 AM - 9:00 AM',
                emoji: '💪',
                title: 'Tập Luyện',
                suggestion: 'Chạy bộ 30 phút hoặc Yoga'
            });
        }

        schedule.push({
            time: '12:00 PM - 1:00 PM',
            emoji: '🍚',
            title: 'Bữa Trưa',
            suggestion: 'Cơm + Thịt nướng + Rau xanh'
        });

        if (pref.includes('chiều')) {
            schedule.push({
                time: '3:00 PM - 5:00 PM',
                emoji: '⚽',
                title: 'Tập Luyện',
                suggestion: 'Gym hoặc Cardio'
            });
        }

        schedule.push({
            time: '6:30 PM - 7:30 PM',
            emoji: '🍜',
            title: 'Bữa Tối',
            suggestion: 'Cơm + Cá/Gà + Canh'
        });

        const scheduleContent = document.getElementById('scheduleContent');
        if (scheduleContent) {
            scheduleContent.innerHTML = schedule.map(function(item) {
                return '<div class="schedule-card"><h3>' + item.emoji + ' ' + item.title + '</h3><p><span class="schedule-time">' + item.time + '</span></p><p>' + item.suggestion + '</p></div>';
            }).join('');
        }
    }

    // ============== HEALTH ASSESSMENT METHODS ==============
    submitHealthAssessment() {
        const values = this.getHealthFormValues();
        const enabledMap = this.getEnabledHealthMetrics();
        const score = this.calculateHealthScore(values, enabledMap);
        if (score === null) {
            alert('⚠️ Hãy bật ít nhất 1 mục để lưu đánh giá.');
            return;
        }

        const assessment = {
            date: new Date().toLocaleDateString('vi-VN'),
            time: new Date().toLocaleTimeString('vi-VN'),
            energy: values.energy,
            sleep: values.sleep,
            mood: values.mood,
            stress: values.stress,
            hunger: values.hunger,
            metricsEnabled: enabledMap,
            score: score
        };

        appState.healthHistory.push(assessment);
        appState.saveToLocalStorage();

        const scoreEl = document.getElementById('wellBeingScore');
        if (scoreEl) scoreEl.textContent = score;

        const statusEl = document.getElementById('scoreStatus');
        if (statusEl) {
            let status = '😊 Tuyệt vời!';
            if (score < 50) status = '😔 Cần cải thiện';
            else if (score < 70) status = '😐 Bình thường';
            statusEl.textContent = status + ' (' + score + '/100)';
        }

        this.updateHealthHistory();
        this.updateMissionProgress('health_assessment', 1, { skipRender: true });
        this.updateStreakDisplay();
        alert('✅ Đánh giá đã lưu!');
    }

    updateHealthDisplay() {
        this.updateHealthScorePreviewFromForm();
        this.updateHealthHistory();
    }

    formatDateKey(date) {
        return date.getFullYear() + '-' +
            String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0');
    }

    parseHealthDate(dateText) {
        if (!dateText) return null;
        const text = String(dateText).trim();
        const viDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

        if (viDateMatch) {
            const day = parseInt(viDateMatch[1], 10);
            const month = parseInt(viDateMatch[2], 10) - 1;
            const year = parseInt(viDateMatch[3], 10);
            const parsed = new Date(year, month, day);

            if (
                parsed.getFullYear() === year &&
                parsed.getMonth() === month &&
                parsed.getDate() === day
            ) {
                parsed.setHours(0, 0, 0, 0);
                return parsed;
            }
        }

        const fallback = new Date(text);
        if (isNaN(fallback.getTime())) return null;
        fallback.setHours(0, 0, 0, 0);
        return fallback;
    }

    getTodayDateKey() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.formatDateKey(today);
    }

    getCompletedStreakDateSet() {
        const dateSet = new Set();
        (appState.healthHistory || []).forEach(function(item) {
            const parsedDate = this.parseHealthDate(item.date);
            if (parsedDate) dateSet.add(this.formatDateKey(parsedDate));
        }, this);

        (appState.dailyCheckIns || []).forEach(function(item) {
            if (item && typeof item.dateKey === 'string' && item.dateKey) {
                dateSet.add(item.dateKey);
            }
        });

        const shieldDates = Array.isArray(appState.gamification && appState.gamification.streakShieldUsedDates)
            ? appState.gamification.streakShieldUsedDates
            : [];
        shieldDates.forEach(function(dateKey) {
            if (typeof dateKey === 'string' && dateKey) {
                dateSet.add(dateKey);
            }
        });

        return dateSet;
    }

    checkInToday(source, options) {
        if (!appState.isAuthenticated) return false;
        const config = options || {};
        const todayKey = this.getTodayDateKey();
        const alreadyChecked = this.getCompletedStreakDateSet().has(todayKey);
        if (alreadyChecked) return false;

        if (!Array.isArray(appState.dailyCheckIns)) {
            appState.dailyCheckIns = [];
        }

        appState.dailyCheckIns.push({
            dateKey: todayKey,
            source: typeof source === 'string' && source ? source : 'manual',
            timestamp: Date.now()
        });
        appState.saveToLocalStorage();

        if (!config.skipRender) {
            this.updateStreakDisplay();
        }

        return true;
    }

    handleManualCheckIn() {
        const added = this.checkInToday('manual', { skipRender: false });
        if (added) {
            alert('✅ Điểm danh thành công! Bạn đã hoàn thành điểm danh hôm nay.');
        } else {
            alert('ℹ️ Bạn đã điểm danh hôm nay rồi.');
        }
    }

    getCurrentStreakDays(dateSet) {
        if (!dateSet || dateSet.size === 0) return 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let cursor = new Date(today);
        const todayKey = this.formatDateKey(today);
        const yesterdayKey = this.formatDateKey(yesterday);

        if (!dateSet.has(todayKey) && dateSet.has(yesterdayKey)) {
            cursor = new Date(yesterday);
        }

        let streak = 0;
        while (dateSet.has(this.formatDateKey(cursor))) {
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
        }

        return streak;
    }

    getLongestStreakDays(dateSet) {
        if (!dateSet || dateSet.size === 0) return 0;

        const sorted = Array.from(dateSet).sort();
        let longest = 1;
        let current = 1;

        for (let i = 1; i < sorted.length; i++) {
            const prevDate = new Date(sorted[i - 1] + 'T00:00:00');
            const currentDate = new Date(sorted[i] + 'T00:00:00');
            const diffDays = Math.round((currentDate - prevDate) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                current += 1;
                longest = Math.max(longest, current);
            } else {
                current = 1;
            }
        }

        return longest;
    }

    getMissedDaysThisMonth(dateSet, today) {
        const year = today.getFullYear();
        const month = today.getMonth();
        let missed = 0;

        for (let day = 1; day <= today.getDate(); day++) {
            const key = this.formatDateKey(new Date(year, month, day));
            if (!dateSet.has(key)) missed += 1;
        }

        return missed;
    }

    shiftStreakCalendarMonth(delta) {
        const step = parseInt(delta, 10);
        if (!step) return;
        const currentOffset = parseInt(this.streakCalendarMonthOffset, 10) || 0;
        this.streakCalendarMonthOffset = Math.min(0, currentOffset + step);
        this.updateStreakDisplay();
    }

    updateStreakCalendarNav() {
        const nextBtn = document.getElementById('streakNextMonthBtn');
        if (!nextBtn) return;
        const currentOffset = parseInt(this.streakCalendarMonthOffset, 10) || 0;
        nextBtn.disabled = currentOffset >= 0;
    }

    renderStreakCalendar(dateSet, today, shieldDateSet) {
        const grid = document.getElementById('streakCalendarGrid');
        const monthLabel = document.getElementById('streakMonthLabel');
        if (!grid || !monthLabel) return;

        const monthOffset = Math.min(0, parseInt(this.streakCalendarMonthOffset, 10) || 0);
        this.streakCalendarMonthOffset = monthOffset;
        const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const leading = (firstDay.getDay() + 6) % 7;

        monthLabel.textContent = 'T' + (month + 1) + ' ' + year;
        this.updateStreakCalendarNav();

        const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        const cells = [];

        weekdays.forEach(function(weekday) {
            cells.push('<div class="streak-weekday">' + weekday + '</div>');
        });

        for (let i = 0; i < leading; i++) {
            cells.push('<div class="streak-day empty"></div>');
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            currentDate.setHours(0, 0, 0, 0);

            const classes = ['streak-day'];
            const key = this.formatDateKey(currentDate);
            const isToday = currentDate.getTime() === today.getTime();
            const isShieldProtected = shieldDateSet && shieldDateSet.has && shieldDateSet.has(key);

            if (currentDate > today) {
                classes.push('future');
            } else if (isToday) {
                classes.push('today');
            } else if (isShieldProtected) {
                classes.push('shield');
            } else if (dateSet.has(key)) {
                classes.push('done');
            } else {
                classes.push('missed');
            }

            cells.push('<div class="' + classes.join(' ') + '">' + day + '</div>');
        }

        grid.innerHTML = cells.join('');
    }

    updateStreakAchievements(longestStreak) {
        const inventory = appState.gamification && appState.gamification.shopInventory
            ? appState.gamification.shopInventory
            : {};
        const honorBadgeOwned = Math.max(0, parseInt(inventory.honorBadge, 10) || 0);

        document.querySelectorAll('#streakAchievementGrid .streak-achievement-card').forEach(function(card) {
            const achievementKey = card.getAttribute('data-achievement');
            if (achievementKey === 'honor_badge') {
                card.classList.toggle('unlocked', honorBadgeOwned > 0);
                return;
            }

            const threshold = parseInt(card.getAttribute('data-threshold'), 10) || 0;
            card.classList.toggle('unlocked', longestStreak >= threshold);
        });
    }

    updateStreakDisplay() {
        const streakPage = document.getElementById('streakPage');
        if (!streakPage) return;

        this.ensureGamificationState();

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayKey = this.formatDateKey(today);

        const dateSet = this.getCompletedStreakDateSet();
        const autoShieldDate = this.tryAutoUseStreakShield(dateSet, today);
        const shieldDateSet = this.getShieldDateSet();
        const currentStreak = this.getCurrentStreakDays(dateSet);
        const longestStreak = this.getLongestStreakDays(dateSet);
        const totalRecords = dateSet.size;
        const missedThisMonth = this.getMissedDaysThisMonth(dateSet, today);
        const checkedInToday = dateSet.has(todayKey);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const usedShieldYesterday = shieldDateSet.has(this.formatDateKey(yesterday));

        const currentEl = document.getElementById('streakCurrentDays');
        const subtextEl = document.getElementById('streakHeroSubtext');
        const totalEl = document.getElementById('streakTotalRecords');
        const longestEl = document.getElementById('streakLongestDays');
        const missEl = document.getElementById('streakMissDays');
        const checkInBtn = document.getElementById('checkInTodayBtn');
        const checkInStatus = document.getElementById('checkInTodayStatus');

        if (currentEl) currentEl.textContent = String(currentStreak);
        if (totalEl) totalEl.textContent = String(totalRecords);
        if (longestEl) longestEl.textContent = String(longestStreak);
        if (missEl) missEl.textContent = String(missedThisMonth);
        if (checkInBtn) {
            checkInBtn.disabled = checkedInToday;
            checkInBtn.textContent = checkedInToday ? '✅ Đã điểm danh hôm nay' : '✅ Điểm danh hôm nay';
        }
        if (checkInStatus) {
            if (checkedInToday) {
                checkInStatus.textContent = usedShieldYesterday
                    ? 'Hôm nay đã điểm danh. Khiên đã bảo vệ chuỗi cho hôm qua.'
                    : 'Hôm nay đã điểm danh (bằng nút hoặc tự động khi chat). Chỉ 1 lần/ngày.';
            } else {
                checkInStatus.textContent = usedShieldYesterday
                    ? 'Bạn chưa điểm danh hôm nay. Chuỗi hôm qua đã được khiên bảo vệ.'
                    : 'Bạn chưa điểm danh hôm nay.';
            }
        }

        if (subtextEl) {
            if (autoShieldDate) {
                subtextEl.textContent = 'Khiên chuỗi đã tự kích hoạt để bảo vệ ngày bỏ lỡ hôm qua.';
            } else if (checkedInToday && currentStreak > 0) {
                subtextEl.textContent = 'Tuyệt vời! Hôm nay bạn đã điểm danh và giữ chuỗi liên tục.';
            } else if (currentStreak > 0) {
                subtextEl.textContent = 'Bạn đang duy trì rất tốt. Cố gắng giữ nhịp mỗi ngày.';
            } else {
                subtextEl.textContent = 'Điểm danh hôm nay để bắt đầu chuỗi mới.';
            }
        }

        this.renderDailyMissions();
        this.renderShopState();
        this.renderStreakCalendar(dateSet, today, shieldDateSet);
        this.updateStreakAchievements(longestStreak);
    }

    updateHealthHistory() {
        const healthHistory = document.getElementById('healthHistory');
        if (!healthHistory) return;

        if (appState.healthHistory.length === 0) {
            healthHistory.innerHTML = '<div class="history-empty">Chưa có dữ liệu đánh giá</div>';
            return;
        }

        healthHistory.innerHTML = appState.healthHistory.reverse().map(function(item, index) {
            const enabledMap = item.metricsEnabled || {};
            const metricText = function(metricKey, icon, label, value) {
                if (enabledMap[metricKey] === false) {
                    return '<p class="metric-disabled">' + icon + ' ' + label + ': Đã tắt</p>';
                }
                return '<p>' + icon + ' ' + label + ': ' + value + '/10</p>';
            };

            return '<div class="history-item">' +
                '<div class="history-item-content">' +
                '<div class="history-date">' + item.date + ' ' + item.time + '</div>' +
                '<div class="history-item-data">' +
                metricText('energy', '💪', 'Năng Lượng', item.energy) +
                metricText('sleep', '😴', 'Giấc Ngủ', item.sleep) +
                metricText('mood', '😊', 'Tâm Trạng', item.mood) +
                metricText('stress', '😌', 'Thư Giãn', item.stress) +
                metricText('hunger', '🍽️', 'Cơn Đói', item.hunger) +
                '</div>' +
                '<div class="history-item-score">🎯 Điểm: ' + item.score + '/100</div>' +
                '</div>' +
                '<button class="btn-delete-item" onclick="app.deleteHealthRecord(' + index + ')">🗑️</button>' +
                '</div>';
        }).join('');
    }

    deleteHealthRecord(index) {
        appState.healthHistory.reverse();
        appState.healthHistory.splice(index, 1);
        appState.healthHistory.reverse();
        appState.saveToLocalStorage();
        this.updateHealthHistory();
        this.updateStreakDisplay();
    }

    clearAllHistory() {
        if (confirm('❌ Bạn chắc chắn muốn xóa tất cả lịch sử sức khỏe?')) {
            appState.healthHistory = [];
            appState.saveToLocalStorage();
            this.updateHealthHistory();
            this.updateStreakDisplay();
            alert('✅ Đã xóa tất cả!');
        }
    }

    // ============== PIN MANAGEMENT ==============
    generateNewPin() {
        if (!pinManager.createdDate) {
            const pins = pinManager.generatePins();
            this.displayPins(pins);
            this.updatePinStatus();
        } else if (pinManager.canGenerateNewPins()) {
            const pins = pinManager.generatePins();
            this.displayPins(pins);
            this.updatePinStatus();
        } else {
            const remaining = pinManager.getPinsStatus();
            alert('⚠️ Bạn còn ' + remaining + ' mã PIN chưa sử dụng!\n\nChỉ được tạo mã PIN mới khi đã dùng hết 8 mã hiện tại.');
        }
    }

    displayPins(pins) {
        const modal = document.getElementById('pinDisplayModal');
        const pinsGrid = document.getElementById('pinsGrid');

        if (!pinsGrid) return;

        pinsGrid.innerHTML = pins.map(function(pin) {
            const isUsed = pinManager.usedPins.includes(pin);
            return '<div class="pin-box' + (isUsed ? ' pin-used' : '') + '">' + pin + '</div>';
        }).join('');

        if (modal) modal.classList.add('active');
    }

    viewPins() {
        if (!pinManager.createdDate) {
            alert('❌ Chưa tạo Mã PIN! Hãy nhấn "Tạo Mã PIN Mới"');
            return;
        }

        const daysUntil = pinManager.getDaysUntilCanView();

        if (daysUntil > 0) {
            const time = pinManager.getTimeUntilCanView();
            let timeStr = '';
            if (time.days > 0) {
                timeStr = time.days + ' ngày ' + time.hours + ' giờ ' + time.minutes + ' phút';
            } else if (time.hours > 0) {
                timeStr = time.hours + ' giờ ' + time.minutes + ' phút ' + time.seconds + ' giây';
            } else {
                timeStr = time.minutes + ' phút ' + time.seconds + ' giây';
            }
            alert('🔒 BẢNG BẢO VỀ - Mã PIN bị khóa!\n\n⏳ Chỉ được xem sau: ' + timeStr);
            return;
        }

        this.displayPins(pinManager.pins);
    }

    updatePinStatus() {
        const pinStatus = document.getElementById('pinStatus');
        if (pinStatus) {
            if (!pinManager.createdDate) {
                pinStatus.innerHTML = '<p>❌ Chưa tạo Mã PIN</p>';
            } else {
                const remaining = pinManager.getPinsStatus();
                const createdDate = pinManager.getCreatedDateString();
                const daysUntil = pinManager.getDaysUntilCanView();

                let html = '<p>✅ Mã PIN được tạo lúc: ' + createdDate + '</p>';
                html += '<p>📊 Mã PIN còn lại: <strong>' + remaining + '/8</strong></p>';

                if (daysUntil > 0) {
                    html += '<p>🔒 Mã PIN bị khóa - Có thể xem sau: <strong id="countdownTimer">' + daysUntil + ' ngày</strong></p>';
                } else {
                    html += '<p>🔓 Mã PIN đã mở khóa - Bạn có thể xem bất cứ lúc nào!</p>';
                }

                if (pinManager.canGenerateNewPins()) {
                    html += '<p style="color: var(--primary-color); font-weight: 600;">🆕 Bạn đã dùng hết 8 mã PIN, có thể tạo mã mới!</p>';
                } else if (remaining > 0) {
                    html += '<p style="color: var(--text-secondary);">⏳ Còn ' + remaining + ' mã chưa dùng, chờ dùng hết hoặc 30 ngày</p>';
                }

                pinStatus.innerHTML = html;
            }
        }
    }

    // ============== AVATAR METHODS ==============
    handleAvatarUpload(e) {
        if (this.isDemoAccount()) {
            this.showDemoFeatureNotice();
            return;
        }

        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            const self = this;

            reader.onload = function(event) {
                self.avatarCropManager.openModal(event.target.result);
            };

            reader.readAsDataURL(file);
        }
    }

    confirmAvatarCrop() {
        if (this.isDemoAccount()) {
            this.showDemoFeatureNotice();
            return;
        }

        const self = this;
        this.avatarCropManager.cropImage().then(function(croppedImageData) {
            settingsManager.updateAvatarDisplay(croppedImageData);
            const settings = settingsManager.getSettings();
            settings.avatar = croppedImageData;
            settingsManager.saveSettings(settings);
            self.avatarCropManager.closeModal();
            alert('✅ Avatar đã cập nhật!');
        });
    }

    // ============== SETTINGS PAGE ==============
    initializeSettingsPage() {
        if (this.isDemoAccount()) {
            this.showDemoFeatureNotice();
            this.goToPage('chat');
            return;
        }

        const nameInput = document.getElementById('settingsName');
        const emailInput = document.getElementById('settingsEmail');

        if (nameInput && appState.currentUser) {
            nameInput.value = appState.currentUser.name;
        }
        if (emailInput && appState.currentUser) {
            emailInput.value = appState.currentUser.email;
        }

        const settings = settingsManager.getSettings();
        if (settings.theme === 'dark') {
            document.getElementById('themeDark').checked = true;
        } else {
            document.getElementById('themeLight').checked = true;
        }

        const currentColor = settings.primaryColor || settingsManager.getDefaultSettings().primaryColor;
        const colorInput = document.getElementById('customThemeColor');
        const hexInput = document.getElementById('customThemeHex');
        if (colorInput) colorInput.value = currentColor;
        if (hexInput) hexInput.value = currentColor.toUpperCase();
        this.syncPresetColorButtons(this.normalizeHexColor(currentColor));
    }

    updateProfile() {
        if (this.isDemoAccount()) {
            this.showDemoFeatureNotice();
            return;
        }

        const name = document.getElementById('settingsName').value.trim();
        const email = document.getElementById('settingsEmail').value.trim();

        if (!name || !email) {
            alert('❌ Vui lòng điền đầy đủ thông tin!');
            return;
        }

        if (appState.currentUser) {
            appState.currentUser.name = name;
            appState.currentUser.email = email;
            appState.saveToLocalStorage();

            document.getElementById('userName').textContent = name;
            document.getElementById('userEmail').textContent = email;

            alert('✅ Thông tin đã cập nhật!');
        }
    }

    updatePassword() {
        if (this.isDemoAccount()) {
            this.showDemoFeatureNotice();
            return;
        }

        const currentPwd = document.getElementById('currentPassword').value;
        const newPwd = document.getElementById('newPassword').value;
        const confirmPwd = document.getElementById('confirmPassword').value;

        if (!currentPwd || !newPwd || !confirmPwd) {
            alert('❌ Vui lòng điền đầy đủ!');
            return;
        }

        if (appState.currentUser && appState.currentUser.password !== currentPwd) {
            alert('❌ Mật khẩu hiện tại không chính xác!');
            return;
        }

        if (newPwd !== confirmPwd) {
            alert('❌ Mật khẩu mới không trùng khớp!');
            return;
        }

        if (newPwd.length < 6) {
            alert('❌ Mật khẩu phải 6+ ký tự!');
            return;
        }

        const usersRaw = safeGetJson('users', []);
        const users = Array.isArray(usersRaw) ? usersRaw : [];
        const userIdx = users.findIndex(function(u) { return u.email === appState.currentUser.email; });

        if (userIdx !== -1) {
            users[userIdx].password = newPwd;
            appState.currentUser.password = newPwd;
            safeSetJson('users', users);
            appState.saveToLocalStorage();

            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';

            alert('✅ Mật khẩu đã cập nhật!');
        }
    }

    // ============== SECURITY PAGE ==============
    initializeSecurityPage() {
        if (this.isDemoAccount()) {
            this.showDemoFeatureNotice();
            this.goToPage('chat');
            return;
        }

        this.updatePinStatus();
    }

    // ============== THEME METHODS ==============
    setTheme(theme) {
        const settings = settingsManager.getSettings();
        settings.theme = theme;
        settingsManager.saveSettings(settings);

        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    resetThemeDefaults(showNotice) {
        const defaults = settingsManager.getDefaultSettings();
        const settings = settingsManager.getSettings();
        settings.theme = defaults.theme;
        settings.primaryColor = defaults.primaryColor;
        settingsManager.saveSettings(settings);

        if (defaults.theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        settingsManager.setThemeColor(defaults.primaryColor);
        this.syncPresetColorButtons(defaults.primaryColor);

        const colorInput = document.getElementById('customThemeColor');
        const hexInput = document.getElementById('customThemeHex');
        const themeLight = document.getElementById('themeLight');
        const themeDark = document.getElementById('themeDark');
        if (colorInput) colorInput.value = defaults.primaryColor;
        if (hexInput) hexInput.value = defaults.primaryColor;
        if (themeLight) themeLight.checked = defaults.theme !== 'dark';
        if (themeDark) themeDark.checked = defaults.theme === 'dark';

        if (showNotice) {
            alert('✅ Đã đặt lại màu mặc định.');
        }
    }

    setThemeColor(color, sourceBtn) {
        const normalizedColor = this.normalizeHexColor(color);
        if (!normalizedColor) {
            alert('❌ Mã màu không hợp lệ. Dùng dạng #RRGGBB');
            return;
        }

        this.syncPresetColorButtons(normalizedColor);

        const colorInput = document.getElementById('customThemeColor');
        const hexInput = document.getElementById('customThemeHex');
        if (colorInput) colorInput.value = normalizedColor;
        if (hexInput) hexInput.value = normalizedColor.toUpperCase();

        settingsManager.setThemeColor(normalizedColor);

        const settings = settingsManager.getSettings();
        settings.primaryColor = normalizedColor;
        settingsManager.saveSettings(settings);
    }

    syncPresetColorButtons(selectedColor) {
        const selected = selectedColor ? this.normalizeHexColor(selectedColor) : null;
        let hasPresetMatch = false;
        document.querySelectorAll('.color-btn').forEach(function(btn) {
            const raw = btn.getAttribute('data-color') || '';
            if (raw) btn.style.backgroundColor = raw;

            if (!selected) {
                btn.classList.remove('active');
                return;
            }

            const normalizedBtnColor = raw ? (raw.startsWith('#') ? raw.toUpperCase() : ('#' + raw).toUpperCase()) : null;
            const isActive = normalizedBtnColor === selected;
            btn.classList.toggle('active', isActive);
            if (isActive) hasPresetMatch = true;
        });

        const colorInput = document.getElementById('customThemeColor');
        const hexInput = document.getElementById('customThemeHex');
        const customActive = !!selected && !hasPresetMatch;
        if (colorInput) colorInput.classList.toggle('active', customActive);
        if (hexInput) hexInput.classList.toggle('active', customActive);
    }

    normalizeHexColor(color) {
        if (!color) return null;
        let value = String(color).trim();
        if (!value.startsWith('#')) value = '#' + value;
        if (/^#[0-9a-fA-F]{3}$/.test(value)) {
            value = '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
        }
        return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : null;
    }

    // ============== STATISTICS PAGE ==============
    initializeStatsPage() {
        const allHistory = Array.isArray(appState.healthHistory) ? appState.healthHistory : [];
        const rangeDays = Math.max(1, Number(this.currentFilterDays) || 1);
        const rangeLabelMap = {
            1: '1 ngày',
            3: '3 ngày',
            7: '1 tuần',
            30: '1 tháng',
            180: '6 tháng',
            365: '1 năm'
        };

        const metricDefs = [
            { key: 'energy', label: 'Cảm Giác Năng Lượng', shortLabel: 'Năng lượng', color: '#FF8C42' },
            { key: 'sleep', label: 'Chất Lượng Giấc Ngủ', shortLabel: 'Giấc ngủ', color: '#FFB347' },
            { key: 'mood', label: 'Tâm Trạng', shortLabel: 'Tâm trạng', color: '#FF6B2B' },
            { key: 'stress', label: 'Thư Giãn', shortLabel: 'Thư giãn', color: '#FFA500' },
            { key: 'hunger', label: 'Cơn Đói', shortLabel: 'Cơn đói', color: '#FF4500' }
        ];

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - (rangeDays - 1));

        const parseDate = function(item) {
            return this.parseHealthDate(item && item.date ? item.date : '');
        }.bind(this);

        const filtered = allHistory.filter(function(item) {
            const itemDate = parseDate(item);
            return !!itemDate && itemDate >= startDate && itemDate <= today;
        });

        const getMetricValues = function(metricKey) {
            return filtered.filter(function(item) {
                return !(item.metricsEnabled && item.metricsEnabled[metricKey] === false);
            }).map(function(item) {
                return Number(item[metricKey]);
            }).filter(function(value) {
                return isFinite(value);
            });
        };

        const metricStats = metricDefs.map(function(metric) {
            const values = getMetricValues(metric.key);
            const avg = values.length > 0
                ? values.reduce(function(sum, value) { return sum + value; }, 0) / values.length
                : 0;

            return {
                key: metric.key,
                label: metric.label,
                shortLabel: metric.shortLabel,
                color: metric.color,
                avg: avg,
                count: values.length
            };
        });

        const validMetricStats = metricStats.filter(function(metric) { return metric.count > 0; });
        const overallAverage = validMetricStats.length > 0
            ? validMetricStats.reduce(function(sum, metric) { return sum + metric.avg; }, 0) / validMetricStats.length
            : 0;

        const setText = function(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        setText('statsTotalSessions', String(filtered.length));
        setText('statsOverallAvg', filtered.length > 0 ? overallAverage.toFixed(1) + '/10' : '--/10');
        setText('statsRangeInfo', rangeLabelMap[rangeDays] || (rangeDays + ' ngày'));

        const metricChart = document.getElementById('metricAvgChart');
        if (metricChart) {
            if (filtered.length === 0) {
                metricChart.innerHTML = '<div class="stats-empty">Không có dữ liệu cho bộ lọc hiện tại.</div>';
            } else {
                metricChart.innerHTML = metricStats.map(function(metric) {
                    const percentage = Math.max(0, Math.min(100, metric.avg * 10));
                    const visibleHeight = metric.count > 0 ? Math.max(8, percentage) : 0;

                    return '<div class="metric-bar-item" title="' + metric.label + ': ' + metric.avg.toFixed(1) + '/10">' +
                        '<div class="metric-bar-track">' +
                        '<div class="metric-bar-fill" style="height: ' + visibleHeight.toFixed(1) + '%; background: ' + metric.color + ';">' +
                        '<small>' + (metric.count > 0 ? metric.avg.toFixed(1) : '--') + '</small>' +
                        '</div>' +
                        '</div>' +
                        '<div class="metric-label">' + metric.shortLabel + '</div>' +
                        '</div>';
                }).join('');
            }
        }

        const detailBody = document.getElementById('statsDetailBody');
        if (!detailBody) return;

        if (filtered.length === 0) {
            detailBody.innerHTML = '<tr><td colspan="4" class="stats-empty">Không có dữ liệu cho bộ lọc hiện tại.</td></tr>';
            return;
        }

        const levelFromAverage = function(avg, count) {
            if (count === 0) return 'Chưa có dữ liệu';
            if (avg >= 8) return 'Tốt';
            if (avg >= 6.5) return 'Khá';
            if (avg >= 5) return 'Trung bình';
            return 'Cần cải thiện';
        };

        detailBody.innerHTML = metricStats.map(function(metric) {
            return '<tr>' +
                '<td><strong>' + metric.label + '</strong></td>' +
                '<td>' + (metric.count > 0 ? metric.avg.toFixed(1) + '/10' : '--') + '</td>' +
                '<td>' + metric.count + '</td>' +
                '<td>' + levelFromAverage(metric.avg, metric.count) + '</td>' +
                '</tr>';
        }).join('');
    }

    // ============== CHAT HISTORY ==============
    renderDefaultChatMarkup() {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        chatMessages.innerHTML = this.getDefaultChatMarkup();
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    openLatestChatOrDefault() {
        const histories = chatHistoryManager.getAllHistories();
        if (histories.length > 0) {
            this.loadChat(histories[0].id);
            return;
        }

        this.goToPage('chat');
        this.renderDefaultChatMarkup();
        this.updateHistoryList();
    }

    startNewChat() {
        chatHistoryManager.startNewSession();
        this.goToPage('chat');
        this.renderDefaultChatMarkup();
        this.updateHistoryList();
    }

    updateHistoryList() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        const histories = chatHistoryManager.getAllHistories();
        const currentSessionId = chatHistoryManager.getCurrentSessionId();

        if (histories.length === 0) {
            historyList.innerHTML = '<div class="chat-history-empty">Không có lịch sử</div>';
            return;
        }

        const dayMs = 24 * 60 * 60 * 1000;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const groups = {
            today: [],
            yesterday: [],
            last7: [],
            last30: [],
            older: []
        };

        histories.forEach(function(session) {
            const time = session.updatedAt || session.createdAt || Date.now();
            const sessionDate = new Date(time);
            const sessionStart = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate()).getTime();
            const diffDays = Math.floor((todayStart - sessionStart) / dayMs);

            if (diffDays <= 0) groups.today.push(session);
            else if (diffDays === 1) groups.yesterday.push(session);
            else if (diffDays <= 7) groups.last7.push(session);
            else if (diffDays <= 30) groups.last30.push(session);
            else groups.older.push(session);
        });

        const groupOrder = [
            { key: 'today', label: 'Hôm nay' },
            { key: 'yesterday', label: 'Hôm qua' },
            { key: 'last7', label: '7 ngày trước' },
            { key: 'last30', label: '30 ngày trước' },
            { key: 'older', label: 'Cũ hơn' }
        ];

        historyList.innerHTML = groupOrder.map(function(group) {
            const items = groups[group.key];
            if (!items || items.length === 0) return '';

            const htmlItems = items.map(function(session) {
                const lastMessage = session.messages && session.messages.length > 0
                    ? session.messages[session.messages.length - 1].text
                    : '';
                const preview = aiEngine.escapeHtml(lastMessage).substring(0, 45);
                return '<div class="chat-history-item' + (session.id === currentSessionId ? ' active' : '') + '">' +
                    '<button class="chat-history-title" onclick="app.loadChat(\'' + session.id + '\')">' + aiEngine.escapeHtml(session.title) + '</button>' +
                    '<div class="chat-history-preview">' + preview + '</div>' +
                    '<button class="chat-history-delete" onclick="app.deleteChat(\'' + session.id + '\')" title="Xóa cuộc trò chuyện">🗑️</button>' +
                    '</div>';
            }).join('');

            return '<div class="chat-history-group">' +
                '<div class="chat-history-group-title">' + group.label + '</div>' +
                htmlItems +
                '</div>';
        }).join('');
    }

    loadChat(sessionId) {
        const session = chatHistoryManager.loadSession(sessionId);
        if (session) {
            this.goToPage('chat');
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.innerHTML = session.messages.map(function(msg) {
                    const bubbleClass = msg.isUser ? 'user' : 'ai';
                    return '<div class="chat-bubble ' + bubbleClass + '"><p>' + msg.text + '</p></div>';
                }).join('');
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
            this.updateHistoryList();
        }
    }

    deleteChat(sessionId) {
        if (confirm('❌ Bạn chắc chắn muốn xóa cuộc trò chuyện này?')) {
            chatHistoryManager.deleteSession(sessionId);
            this.updateHistoryList();
            if (sessionId === chatHistoryManager.getCurrentSessionId()) {
                this.startNewChat();
            }
        }
    }
}

// ============== INITIALIZE ==============
const app = new VietverseApp();

window.addEventListener('load', function() {
    if (appState.isAuthenticated && appState.currentUser) {
        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        if (userNameEl) userNameEl.textContent = appState.currentUser.name;
        if (userEmailEl) userEmailEl.textContent = appState.currentUser.email;
        chatHistoryManager.loadHistories(appState.currentUser.email);
        app.updateHistoryList();
        app.startNewChat();
    } else {
        app.setHistoryPanelVisible(false);
        app.setAuthUIState(false);

        const authPageFromUrl = app.getAuthPageFromUrl();
        const authPage = authPageFromUrl || 'login';
        app.switchAuthPage(authPage);
        app.goToPage(authPage);
    }
});

window.addEventListener('beforeunload', function() {
    if (app.timerInterval) {
        clearInterval(app.timerInterval);
    }
    if (app.sessionCheckInterval) {
        clearInterval(app.sessionCheckInterval);
    }
    chatHistoryManager.saveCurrentSessionOnExit();
});