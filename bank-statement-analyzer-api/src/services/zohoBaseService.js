import axios from 'axios';
import zohoAuth from '../config/auth.js';

export class ZohoBaseService {
    constructor() {
        this.client = axios.create();
        this.client.interceptors.request.use(async config => {
            const token = await zohoAuth.getAccessToken();
            config.headers.Authorization = `Bearer ${token}`;
            return config;
        });
    }

    async handleResponse(response) {
        if (response?.data?.status_code >= 400) {
            throw new Error(`Zoho API Error: ${response.data.message}`);
        }
        return response.data;
    }
}