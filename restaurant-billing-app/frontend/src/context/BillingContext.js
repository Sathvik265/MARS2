import React, { createContext, useState, useEffect } from 'react';
import { fetchBillingRecords } from '../services/api';

export const BillingContext = createContext();

export const BillingProvider = ({ children }) => {
    const [billingRecords, setBillingRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadBillingRecords = async () => {
            try {
                const records = await fetchBillingRecords();
                setBillingRecords(records);
            } catch (err) {
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        loadBillingRecords();
    }, []);

    return (
        <BillingContext.Provider value={{ billingRecords, loading, error }}>
            {children}
        </BillingContext.Provider>
    );
};