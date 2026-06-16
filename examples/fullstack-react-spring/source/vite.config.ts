import react from '@vitejs/plugin-react';
export default { plugins: [react()], server: { proxy: { '/api': 'http://localhost:8080' } } };
