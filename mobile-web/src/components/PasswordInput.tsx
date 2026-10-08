import { Check, Eye, EyeOff, X } from 'lucide-react'
import { useState } from 'react'
import { PASSWORD_RULES } from '../services/password'

interface PasswordInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  showRules?: boolean
}

export default function PasswordInput({ label, value, onChange, autoComplete, showRules = false }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {label}
        <span className="relative mt-1 block">
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete={autoComplete}
            required
            className="w-full rounded-xl border border-slate-300 py-3 pl-3 pr-11 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      {showRules && (
        <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
          {PASSWORD_RULES.map((rule) => {
            const ok = rule.test(value)
            return (
              <li key={rule.id} className={`flex items-center gap-1 ${ok ? 'text-emerald-700' : 'text-slate-500'}`}>
                {ok ? <Check size={14} /> : <X size={14} />} {rule.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
