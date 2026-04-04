/**
 * Axios API client instance and shared API type definitions.
 * All API communication goes through this client.
 */
import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export default apiClient
