import { motion } from 'framer-motion';

interface VirtualNumpadProps {
  onKey: (key: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
}

const KEYS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
];

export default function VirtualNumpad({ onKey, onBackspace, onSubmit }: VirtualNumpadProps) {
  return (
    <div className="flex flex-col gap-2 max-w-lg mx-auto w-full">
      {KEYS.map((row, ri) => (
        <div key={ri} className="flex gap-2 justify-center">
          {row.map((k) => (
            <motion.button
              key={k}
              whileTap={{ scale: 0.93 }}
              onClick={() => onKey(k)}
              className="w-12 h-12 rounded-xl bg-white/10 text-white text-lg font-bold
                         hover:bg-white/20 active:bg-white/25 transition-colors"
            >
              {k}
            </motion.button>
          ))}
        </div>
      ))}

      {/* Bottom row: backspace + Z/V/N/M + submit */}
      <div className="flex gap-2 justify-center">
        {['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((k) => (
          <motion.button
            key={k}
            whileTap={{ scale: 0.93 }}
            onClick={() => onKey(k)}
            className="w-12 h-12 rounded-xl bg-white/10 text-white text-lg font-bold
                       hover:bg-white/20 active:bg-white/25 transition-colors"
          >
            {k}
          </motion.button>
        ))}
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={onBackspace}
          className="w-16 h-12 rounded-xl bg-white/10 text-white text-sm font-bold
                     hover:bg-red-500/30 active:bg-red-500/40 transition-colors"
        >
          DEL
        </motion.button>
      </div>

      {/* Submit */}
      <div className="flex justify-center mt-1">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onSubmit}
          className="w-full max-w-xs h-14 rounded-xl bg-violet-600 text-white text-xl font-bold
                     hover:bg-violet-500 active:bg-violet-700 transition-colors"
        >
          Submit
        </motion.button>
      </div>
    </div>
  );
}
