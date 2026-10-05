"use client";

import * as React from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Camera,
  X,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedText: string) => void;
}

export function QRScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
}: QRScannerModalProps) {
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [isInitializing, setIsInitializing] = React.useState(true);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [hasScanned, setHasScanned] = React.useState(false);
  const [cameras, setCameras] = React.useState<Array<{ id: string; label: string }>>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = React.useState(0);

  const scannerRef = React.useRef<Html5Qrcode | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const elementId = "html5-qr-reader-viewport";

  // Stop scanner safely
  const stopScanner = React.useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // ignore cleanup errors
      }
      scannerRef.current = null;
    }
  }, []);

  // Handle scanned text
  const handleDecoded = React.useCallback(
    async (decodedText: string) => {
      if (hasScanned || isProcessing) return;
      setHasScanned(true);
      setIsProcessing(true);

      // Stop camera feed
      await stopScanner();

      // Trigger success callback
      onScanSuccess(decodedText.trim());
      onClose();
    },
    [hasScanned, isProcessing, onScanSuccess, onClose, stopScanner]
  );

  // Start scanner with specific camera or facingMode
  const startScanner = React.useCallback(
    async (cameraIdOrFacing?: string | { facingMode: string }) => {
      setIsInitializing(true);
      setCameraError(null);

      // Ensure DOM element is present
      const container = document.getElementById(elementId);
      if (!container) {
        setIsInitializing(false);
        return;
      }

      await stopScanner();

      try {
        const qrScanner = new Html5Qrcode(elementId);
        scannerRef.current = qrScanner;

        // Try getting cameras list if empty
        try {
          const deviceList = await Html5Qrcode.getCameras();
          if (deviceList && deviceList.length > 0) {
            setCameras(deviceList);
          }
        } catch {
          // Ignore camera listing failure
        }

        const config = {
          fps: 10,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0,
        };

        const cameraMode = cameraIdOrFacing || { facingMode: "environment" };

        await qrScanner.start(
          cameraMode,
          config,
          (decodedText) => {
            handleDecoded(decodedText);
          },
          () => {
            // Frame error - searching
          }
        );

        setIsInitializing(false);
      } catch (err: unknown) {
        setIsInitializing(false);
        const errorMsg =
          err instanceof Error ? err.message : String(err || "");

        if (
          errorMsg.includes("NotAllowedError") ||
          errorMsg.includes("Permission denied")
        ) {
          setCameraError(
            "Kameradan foydalanishga ruxsat berilmadi. Iltimos, brauzer sozlamalarida kameraga ruxsat bering yoki rasm yuklang."
          );
        } else if (
          errorMsg.includes("NotFoundError") ||
          errorMsg.includes("DevicesNotFoundError")
        ) {
          setCameraError(
            "Qurilmada kamera topilmadi. Proyektordagi 6 belgili kod orqali davomatdan o'tishingiz mumkin."
          );
        } else {
          setCameraError(
            "Kamerani ishga tushirib bo'lmadi. 6 belgili kod orqali yoki QR rasm yuklash orqali urinib ko'ring."
          );
        }
      }
    },
    [handleDecoded, stopScanner]
  );

  // Switch between available cameras
  const handleSwitchCamera = async () => {
    if (cameras.length <= 1) return;
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIndex);
    await startScanner(cameras[nextIndex].id);
  };

  // Scan from uploaded image file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      await stopScanner();

      const qrScanner = new Html5Qrcode(elementId);
      scannerRef.current = qrScanner;

      const decodedText = await qrScanner.scanFile(file, true);
      if (decodedText) {
        handleDecoded(decodedText);
      }
    } catch {
      setIsProcessing(false);
      setCameraError("Tanlangan rasmda QR kod aniqlanmadi. Iltimos, boshqa rasm tanlang.");
    }
  };

  // Mount/Unmount lifecycle
  React.useEffect(() => {
    if (isOpen) {
      // Small delay to allow dialog DOM animation to finish before initializing video
      const timer = setTimeout(() => {
        setHasScanned(false);
        setIsProcessing(false);
        startScanner();
      }, 300);

      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen, startScanner, stopScanner]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in"
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="qr-scanner-title"
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                QR Kodni skanerlash
              </h2>
              <p className="text-[11px] text-slate-400">
                Proyektordagi QR belgisiga qarating
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport Body */}
        <div className="p-5 space-y-4">
          <div className="relative w-full aspect-square max-w-[320px] mx-auto rounded-2xl overflow-hidden bg-slate-900 border-2 border-teal-500/40 shadow-inner flex items-center justify-center">
            {/* HTML5 QR Code Mount Node */}
            <div
              id={elementId}
              className="w-full h-full [&_video]:w-full! [&_video]:h-full! [&_video]:object-cover!"
            />

            {/* Scanning viewfinder overlay */}
            {!cameraError && !isInitializing && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative w-56 h-56 border-2 border-teal-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-teal-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-teal-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-teal-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-teal-400 rounded-br-lg" />

                  {/* Animated laser scan line */}
                  <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-teal-400 to-transparent shadow-[0_0_8px_#2dd4bf] animate-[scan_2s_ease-in-out_infinite]" />
                </div>
              </div>
            )}

            {/* Loading Spinner */}
            {isInitializing && !cameraError && (
              <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-3 text-white">
                <Loader2 className="w-9 h-9 text-teal-400 animate-spin" />
                <span className="text-xs font-medium">Kamera ishga tushmoqda...</span>
              </div>
            )}

            {/* Processing State */}
            {isProcessing && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 text-white">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 animate-bounce" />
                <span className="text-xs font-bold">QR kod o&apos;qildi, tasdiqlanmoqda...</span>
              </div>
            )}

            {/* Error Message in Viewport */}
            {cameraError && (
              <div className="absolute inset-0 p-5 bg-slate-900/95 flex flex-col items-center justify-center text-center gap-3 text-slate-200">
                <AlertTriangle className="w-10 h-10 text-amber-400" />
                <p className="text-xs text-slate-300 max-w-xs">{cameraError}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => startScanner()}
                  className="gap-2 mt-1 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Qayta urinish
                </Button>
              </div>
            )}
          </div>

          {/* Action buttons (Camera switch / Upload QR image) */}
          <div className="flex items-center justify-center gap-3 pt-1">
            {cameras.length > 1 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSwitchCamera}
                className="gap-2 text-xs min-h-[40px]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Kamerani almashtirish</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2 text-xs min-h-[40px]"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>QR rasm yuklash</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-center">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Kamerangizni proyektordagi QR kodga to&apos;g&apos;rilang — davomat avtomatik belgilanadi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
