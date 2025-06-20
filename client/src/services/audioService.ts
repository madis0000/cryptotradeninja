// Audio notification service for trading events
export class AudioService {
  private static instance: AudioService;
  private audioContext: AudioContext | null = null;
  private loadedSounds: Map<string, AudioBuffer> = new Map();
  private volume: number = 0.5;

  private constructor() {
    this.initializeAudioContext();
  }

  public static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  private initializeAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('Audio not supported in this browser:', error);
    }
  }

  // Set volume (0.0 to 1.0)
  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  // Generate chin-chin sound (two quick bell tones)
  private generateChinChinSound(): AudioBuffer {
    if (!this.audioContext) throw new Error('Audio context not available');
    
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.6; // 600ms total
    const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    // First "chin" - higher frequency
    for (let i = 0; i < sampleRate * 0.15; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 8); // Quick decay
      data[i] = Math.sin(2 * Math.PI * 800 * t) * envelope * 0.3;
    }

    // Short pause
    for (let i = sampleRate * 0.15; i < sampleRate * 0.25; i++) {
      data[i] = 0;
    }

    // Second "chin" - slightly lower frequency
    for (let i = sampleRate * 0.25; i < sampleRate * 0.4; i++) {
      const t = (i - sampleRate * 0.25) / sampleRate;
      const envelope = Math.exp(-t * 8); // Quick decay
      data[i] = Math.sin(2 * Math.PI * 700 * t) * envelope * 0.3;
    }

    return buffer;
  }

  // Generate beep sound (single tone)
  private generateBeepSound(): AudioBuffer {
    if (!this.audioContext) throw new Error('Audio context not available');
    
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.3; // 300ms
    const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 5); // Gradual decay
      data[i] = Math.sin(2 * Math.PI * 600 * t) * envelope * 0.2;
    }

    return buffer;
  }

  // Generate notification sound (ascending tones)
  private generateNotificationSound(): AudioBuffer {
    if (!this.audioContext) throw new Error('Audio context not available');
    
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.5; // 500ms
    const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const progress = t / duration;
      const frequency = 400 + (progress * 200); // 400Hz to 600Hz
      const envelope = Math.sin(Math.PI * progress) * 0.2; // Bell curve envelope
      data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope;
    }

    return buffer;
  }

  // Load or generate sound
  private async getSound(soundName: string): Promise<AudioBuffer> {
    if (this.loadedSounds.has(soundName)) {
      return this.loadedSounds.get(soundName)!;
    }

    let buffer: AudioBuffer;
    
    switch (soundName) {
      case 'chin-chin':
        buffer = this.generateChinChinSound();
        break;
      case 'beep':
        buffer = this.generateBeepSound();
        break;
      case 'notification':
        buffer = this.generateNotificationSound();
        break;
      default:
        buffer = this.generateBeepSound(); // Fallback
    }

    this.loadedSounds.set(soundName, buffer);
    return buffer;
  }

  // Play sound
  public async playSound(soundName: string): Promise<void> {
    console.log('[AUDIO SERVICE] playSound called with:', soundName);
    console.log('[AUDIO SERVICE] Audio context state:', this.audioContext?.state);
    console.log('[AUDIO SERVICE] Volume:', this.volume);
    
    if (!this.audioContext) {
      console.warn('Audio context not available');
      return;
    }

    try {
      // Resume audio context if suspended (due to autoplay policies)
      if (this.audioContext.state === 'suspended') {
        console.log('[AUDIO SERVICE] Resuming suspended audio context...');
        await this.audioContext.resume();
        console.log('[AUDIO SERVICE] Audio context resumed, new state:', this.audioContext.state);
      }

      const buffer = await this.getSound(soundName);
      console.log('[AUDIO SERVICE] Got sound buffer, length:', buffer.length);
      
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();
      
      source.buffer = buffer;
      gainNode.gain.value = this.volume;
      
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      console.log('[AUDIO SERVICE] Starting sound playback...');
      source.start();
      console.log('[AUDIO SERVICE] Sound started successfully');
      
    } catch (error) {
      console.warn('Failed to play sound:', error);
      throw error;
    }
  }

  // Play order fill notification based on order type
  public async playOrderFillNotification(orderType: 'take_profit' | 'safety_order' | 'base_order', settings?: any): Promise<void> {
    if (!settings?.soundNotificationsEnabled) return;

    let soundName = 'beep'; // Default
    let shouldPlay = true;

    switch (orderType) {
      case 'take_profit':
        soundName = settings.takeProfitSound || 'chin-chin';
        shouldPlay = settings.takeProfitSoundEnabled !== false;
        break;
      case 'safety_order':
        soundName = settings.safetyOrderSound || 'beep';
        shouldPlay = settings.safetyOrderSoundEnabled !== false;
        break;
      case 'base_order':
        soundName = settings.baseOrderSound || 'notification';
        shouldPlay = settings.baseOrderSoundEnabled !== false;
        break;
    }

    if (shouldPlay) {
      if (settings.notificationVolume !== undefined) {
        this.setVolume(parseFloat(settings.notificationVolume));
      }
      await this.playSound(soundName);
    }
  }

  // Play manual order placement notification
  public async playManualOrderPlacementNotification(settings?: any): Promise<void> {
    console.log('[AUDIO SERVICE] Playing manual order placement notification, settings:', settings);
    
    if (!settings?.soundNotificationsEnabled) {
      console.log('[AUDIO SERVICE] Sound notifications disabled');
      return;
    }
    
    // Check if manual order placement sound is enabled
    const manualOrderSoundEnabled = settings.manualOrderSoundEnabled !== false;
    if (!manualOrderSoundEnabled) {
      console.log('[AUDIO SERVICE] Manual order sounds disabled');
      return;
    }

    const soundName = settings.manualOrderSound || 'notification';
    console.log('[AUDIO SERVICE] Playing sound:', soundName);
    
    if (settings.notificationVolume !== undefined) {
      this.setVolume(parseFloat(settings.notificationVolume));
      console.log('[AUDIO SERVICE] Set volume to:', parseFloat(settings.notificationVolume));
    }
    
    try {
      await this.playSound(soundName);
      console.log('[AUDIO SERVICE] Successfully played manual order placement sound');
    } catch (error) {
      console.error('[AUDIO SERVICE] Failed to play manual order placement sound:', error);
      throw error;
    }
  }
}

export const audioService = AudioService.getInstance();