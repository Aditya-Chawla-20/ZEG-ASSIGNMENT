import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainPage } from '@/pages/MainPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainPage />
    </QueryClientProvider>
  );
}

export default App;
