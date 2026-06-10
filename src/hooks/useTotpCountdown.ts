import { useEffect, useState } from 'react';

import { getTOTPTimeRemaining } from '../lib/otp';

export function useTotpCountdown() {
  const [totpCountdown, setTotpCountdown] = useState(30);

  useEffect(() => {
    const interval = setInterval(() => {
      setTotpCountdown(getTOTPTimeRemaining());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return totpCountdown;
}
