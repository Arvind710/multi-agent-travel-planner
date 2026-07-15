"use client";

import { useState, useEffect } from "react";

export function NetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);
  const [isLowBandwidth, setIsLowBandwidth] = useState(false);

  useEffect(() => {
    // Basic offline detection
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOffline(!navigator.onLine);

    // Basic low-bandwidth detection
    const connection =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;
    if (connection) {
      if (
        connection.saveData ||
        connection.effectiveType === "2g" ||
        connection.effectiveType === "slow-2g"
      ) {
        setIsLowBandwidth(true);
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Low bandwidth feature flag check
  const lowBandwidthEnabled = process.env.NEXT_PUBLIC_FLAG_FEATURES_LOW_BANDWIDTH === "true";

  if (!isOffline && (!isLowBandwidth || !lowBandwidthEnabled)) {
    return null; // Don't show if everything is fine or feature flag is off
  }

  return (
    <div className="bg-yellow-100 text-yellow-800 p-2 text-center text-sm font-medium border-b border-yellow-200">
      {isOffline && <span>You are offline. Showing cached version. </span>}
      {!isOffline && isLowBandwidth && <span>Low bandwidth detected. </span>}
      {lowBandwidthEnabled && (isOffline || isLowBandwidth) && (
        <span className="font-bold">Using Low-Bandwidth Mode.</span>
      )}
    </div>
  );
}
