export function getOrCreateRecovery<T>(paymentId: string, promiseFactory: () => Promise<T>): Promise<T>;
export function waitForAllRecoveries(): Promise<unknown[]>;
export function getGlobalRecoveryMap(): Map<string, Promise<unknown>>;
