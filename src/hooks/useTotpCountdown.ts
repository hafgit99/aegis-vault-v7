import { useEffect, useState } from 'react';

import { getTOTPTimeRemaining } from '../lib/otp';

export function useTotpCountdown(period = 30) {
  const [totpCountdown, setTotpCountdown] = useState(period);

  useEffect(() => {
    const interval = setInterval(() => {
      setTotpCountdown(getTOTPTimeRemaining(period));
    }, 1000);

    return () => clearInterval(interval);
  }, [period]);

  return totpCountdown;
}
