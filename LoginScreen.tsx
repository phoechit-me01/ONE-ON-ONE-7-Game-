import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Mail, Lock, Eye, EyeOff, AlertCircle, LogIn, Check } from 'lucide-react';
import { auth, setActivePlayerSession } from '../firebase';
import { verifySenderGamePassword } from '../services/giftService';
import { HeartLogo } from './HeartLogo';

interface RegisteredPlayerOption {
  userId: 'user_phoe_chit' | 'user_tin_moe_hlaing';
  displayName: string;
  email: string;
}

const REGISTERED_PLAYERS: RegisteredPlayerOption[] = [
  {
    userId: 'user_phoe_chit',
    displayName: 'PHOE CHIT',
    email: 'mgphoechit770@gmail.com',
  },
  {
    userId: 'user_tin_moe_hlaing',
    displayName: 'Tin Moe Hlaing',
    email: 'tinmoeh09@gmail.com',
  },
];

export interface LoginScreenProps {
  onLoginSuccess?: (userId: 'user_phoe_chit' | 'user_tin_moe_hlaing') => void;
}

function resolveTargetPlayerFromEmail(
  rawEmail: string
): 'user_phoe_chit' | 'user_tin_moe_hlaing' | null {
  const clean = rawEmail.trim().toLowerCase();
  if (clean === 'mgphoechit770@gmail.com') return 'user_phoe_chit';
  if (clean === 'tinmoeh09@gmail.com') return 'user_tin_moe_hlaing';
  return null;
}

/**
 * Clean Dark-Futuristic Account Selection & Login Screen
 * - Shown after signing out or when authenticating a player session.
 * - Supports selecting PHOE CHIT or Tin Moe Hlaing and authenticating via
 *   Firebase Auth Email/Password or the player's Firestore Game Password / PIN.
 */
export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [selectedUserId, setSelectedUserId] = useState<
    'user_phoe_chit' | 'user_tin_moe_hlaing'
  >('user_phoe_chit');
  const [email, setEmail] = useState<string>('mgphoechit770@gmail.com');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSelectAccount = (player: RegisteredPlayerOption) => {
    setSelectedUserId(player.userId);
    setEmail(player.email);
    setPassword('');
    setErrorMessage(null);
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    const matched = resolveTargetPlayerFromEmail(value);
    if (matched) {
      setSelectedUserId(matched);
    }
    if (errorMessage) setErrorMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setErrorMessage(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMessage('Please select an account or enter your email address.');
      return;
    }

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setErrorMessage('Please enter your password or Game PIN.');
      return;
    }

    const targetUserId = resolveTargetPlayerFromEmail(trimmedEmail);
    if (!targetUserId) {
      setErrorMessage(
        'Unrecognized player email. Please select PHOE CHIT or Tin Moe Hlaing.'
      );
      return;
    }

    setIsLoading(true);

    try {
      // 1. Attempt Firebase Authentication first
      try {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
        setActivePlayerSession(targetUserId);
        setPassword('');
        onLoginSuccess?.(targetUserId);
        return;
      } catch (firebaseErr: unknown) {
        // 2. Fallback: verify against the player's Firestore Game Password / PIN (`pin_code`)
        const pinCheck = await verifySenderGamePassword(
          targetUserId,
          trimmedPassword
        );
        if (pinCheck.ok) {
          setActivePlayerSession(targetUserId);
          setPassword('');
          onLoginSuccess?.(targetUserId);
          return;
        }

        // Surface clear error message if both checks fail
        let friendlyMessage =
          'Invalid password or Game PIN. Please verify your credentials.';
        if (
          firebaseErr &&
          typeof firebaseErr === 'object' &&
          'code' in firebaseErr
        ) {
          const code = String((firebaseErr as { code: string }).code);
          if (code === 'auth/too-many-requests') {
            friendlyMessage =
              'Too many login attempts. Please wait a moment or enter your Game PIN.';
          } else if (code === 'auth/network-request-failed') {
            friendlyMessage =
              'Network connection error. Please check your internet connection.';
          }
        }
        setErrorMessage(friendlyMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex justify-center items-center bg-[#060912] p-0 sm:py-6 select-none">
      <div className="w-full max-w-[430px] min-h-screen sm:min-h-[820px] bg-[#0B0F19] sm:border sm:border-[#1E293B] sm:rounded-[28px] flex flex-col justify-between py-9 px-5 text-[#F8FAFC]">
        {/* Top Brand Identity */}
        <div className="w-full flex flex-col items-center pt-2">
          <HeartLogo size={74} className="mb-3" />
          <h1 className="text-[22px] font-bold tracking-wide text-[#F8FAFC] text-center">
            ONE ON ONE 7
          </h1>
          <p className="text-[12px] text-[#94A3B8] mt-1 text-center">
            Select your player profile to continue
          </p>
        </div>

        {/* Account Selection & Credentials Card */}
        <div className="w-full bg-[#111827] border border-[#1E293B] rounded-[20px] p-5 my-auto">
          <div className="mb-4">
            <h2 className="text-[16px] font-bold text-[#F8FAFC]">
              Player Sign In
            </h2>
            <p className="text-[12px] text-[#94A3B8] mt-0.5">
              Choose an account and enter your password or Game PIN
            </p>
          </div>

          {/* Account Selection Cards */}
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {REGISTERED_PLAYERS.map((player) => {
              const isSelected = selectedUserId === player.userId;
              return (
                <button
                  key={player.userId}
                  type="button"
                  onClick={() => handleSelectAccount(player)}
                  className={`min-h-[68px] p-3 rounded-[14px] border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#0F172A] border-[#3B82F6] text-[#F8FAFC]'
                      : 'bg-[#0B0F19] border-[#1E293B] text-[#94A3B8] hover:border-[#334155] hover:text-[#CBD5E1]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 w-full">
                    <span className="text-[16px] leading-none">👤</span>
                    {isSelected && (
                      <Check size={14} className="text-[#60A5FA] shrink-0" />
                    )}
                  </div>
                  <div className="mt-2 min-w-0">
                    <div className="text-[13px] font-bold truncate leading-tight">
                      {player.displayName}
                    </div>
                    <div className="text-[10px] text-[#64748B] truncate mt-0.5">
                      {player.email}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 px-3 py-2.5 rounded-[12px] bg-[#450A0A] border border-[#EF4444] text-[#FCA5A5] text-[12px] flex items-start gap-2"
            >
              <AlertCircle size={15} className="text-[#F87171] mt-0.5 shrink-0" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {/* Sign In Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            <div>
              <label
                htmlFor="login-email"
                className="block text-[12px] font-medium text-[#CBD5E1] mb-1.5"
              >
                Account Email
              </label>
              <div className="relative flex items-center w-full h-[48px] rounded-[12px] border border-[#334155] bg-[#0B0F19] px-3.5 focus-within:border-[#3B82F6]">
                <Mail size={16} className="text-[#64748B] shrink-0 mr-2.5" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="mgphoechit770@gmail.com"
                  autoComplete="email"
                  className="w-full h-full bg-transparent text-[13px] text-[#F8FAFC] placeholder-[#475569] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[12px] font-medium text-[#CBD5E1] mb-1.5"
              >
                Password / Game PIN
              </label>
              <div className="relative flex items-center w-full h-[48px] rounded-[12px] border border-[#334155] bg-[#0B0F19] px-3.5 focus-within:border-[#3B82F6]">
                <Lock size={16} className="text-[#64748B] shrink-0 mr-2.5" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Enter password or Game PIN"
                  autoComplete="current-password"
                  className="w-full h-full bg-transparent text-[13px] text-[#F8FAFC] placeholder-[#475569] focus:outline-none pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[#64748B] hover:text-[#CBD5E1] transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-1.5 w-full h-[48px] rounded-[12px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-65 disabled:cursor-not-allowed"
            >
              <LogIn size={17} />
              <span>{isLoading ? 'Signing In...' : 'Sign In to Game'}</span>
            </button>
          </form>
        </div>

        {/* Quiet Footer */}
        <div className="text-center pt-3">
          <p className="text-[11px] text-[#64748B]">
            Private Sanctuary · Two-Player Isolated Accounts
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
