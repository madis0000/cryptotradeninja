// Update the login/register form error handling

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setIsLoading(true);

  try {
    const response = await fetch(`/api/auth/${isLogin ? 'login' : 'register'}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle specific error messages
      if (response.status === 500) {
        setError('Server error. Please try again later.');
        console.error('Server error:', data);
      } else {
        setError(data.error || 'An error occurred');
      }
      return;
    }

    // Success handling
    if (data.token) {
      localStorage.setItem('token', data.token);
      onAuthSuccess?.(data.token);
    }
  } catch (error) {
    console.error('Network error:', error);
    setError('Network error. Please check your connection and try again.');
  } finally {
    setIsLoading(false);
  }
};
