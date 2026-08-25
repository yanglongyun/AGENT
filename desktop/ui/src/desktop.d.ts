interface DesktopBridge {
    selectFiles(): Promise<string[]>;
    selectDirectory(): Promise<string>;
    pathForFile(file: File): string;
    platform: string;
}

interface Window { desktop?: DesktopBridge; }
