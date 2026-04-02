import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api/config';
 
interface LockResponse {
    status: string;
    locked_by?: string;
    message?: string;
}
 
export const useRecordLock = (entityType: string, entityId: number | null) => {
    const [isLocked, setIsLocked] = useState<boolean>(false);
    const [lockedBy, setLockedBy] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
 
    const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
 
    const getBaseUrl = () => {
        let baseUrl = api.defaults.baseURL || 'http://localhost:8000';
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        if (baseUrl.endsWith('/api')) return baseUrl;
        return `${baseUrl}/api`;
    };
 
    const acquireLock = useCallback(async () => {
        if (!entityId) return;
 
        try {
            const response = await api.post<LockResponse>('/locks/acquire', {
                entity_type: entityType,
                entity_id: entityId
            });
 
            if (response.data.status === "locked") {
                console.warn(`[LOCK SYSTEM] 🔒 Already Locked by: ${response.data.locked_by}`);
                setIsLocked(true);
                setLockedBy(response.data.locked_by || "Unknown");
            } else {
                // We successfully acquired or refreshed the lock
                setIsLocked(false);
                setLockedBy(null);
            }
        } catch (error: any) {
            if (error.response?.status === 409) {
                const detail = error.response.data?.detail;
                const user = detail?.locked_by || "Unknown User";
                console.warn(`[LOCK SYSTEM] 🔒 Conflict - Locked by: ${user}`);
                setIsLocked(true);
                setLockedBy(user);
            } else {
                console.error(`[LOCK SYSTEM] ❌ Error acquiring lock:`, error);
            }
        } finally {
            setIsLoading(false);
        }
    }, [entityType, entityId]);
 
    useEffect(() => {
        if (!entityId) {
            setIsLoading(false);
            return;
        }
 
        // 1. Initial Lock
        setIsLoading(true);
        acquireLock();
 
        // 2. Heartbeat: Refresh lock every 2 minutes
        heartbeatInterval.current = setInterval(() => {
            // We blindly try to acquire/refresh.
            // If we own it, it refreshes. If someone else stole it (unlikely), we get 409.
            acquireLock();
        }, 60000);
 
        // 3. Cleanup
        return () => {
            if (heartbeatInterval.current) {
                clearInterval(heartbeatInterval.current);
            }
 
            // Only attempt to release if we are not currently locked out
            // (If we were locked out, we don't own the lock, so don't delete it)
            if (!isLocked) {
                const fullUrl = `${getBaseUrl()}/locks/release`;
                const payload = JSON.stringify({ entity_type: entityType, entity_id: entityId });
                const token = localStorage.getItem('token') || localStorage.getItem('access_token');
 
                // Use fetch with keepalive ensures request sends even if tab closes
                fetch(fullUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? `Bearer ${token}` : ''
                    },
                    body: payload,
                    keepalive: true
                }).catch(err => console.error("[LOCK SYSTEM] Release failed:", err));
            }
        };
    }, [entityType, entityId, acquireLock]); // Removed isLocked dependency to prevent cleanup loops
 
    return { isLocked, lockedBy, isLoading };
};