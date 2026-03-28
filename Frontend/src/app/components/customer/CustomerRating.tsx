import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Star, Send, CheckCircle } from 'lucide-react';
import { corporateAccounts, engagements, executives } from '../../data/mockData';

export function CustomerRating() {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedEngagement, setSelectedEngagement] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState('');
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  
  const accountEngagements = selectedAccount
    ? engagements.filter(e => e.accountId === selectedAccount && e.status === 'completed')
    : [];
  
  const selectedAccountData = corporateAccounts.find(a => a.id === selectedAccount);
  const selectedEngagementData = engagements.find(e => e.id === selectedEngagement);
  const executive = selectedEngagementData 
    ? executives.find(ex => ex.id === selectedEngagementData.executiveId)
    : null;
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAccount || !selectedEngagement || !rating || !category || !feedback) {
      alert('Please fill in all fields');
      return;
    }
    
    // In a real app, this would send to the backend
    console.log({
      accountId: selectedAccount,
      engagementId: selectedEngagement,
      executiveId: selectedEngagementData?.executiveId,
      score: rating,
      category,
      feedback,
      submittedAt: new Date().toISOString(),
    });
    
    setSubmitted(true);
    
    // Reset form after 3 seconds
    setTimeout(() => {
      setSelectedAccount('');
      setSelectedEngagement('');
      setRating(0);
      setCategory('');
      setFeedback('');
      setSubmitted(false);
    }, 3000);
  };
  
  const categories = [
    'Professionalism',
    'Responsiveness',
    'Product Knowledge',
    'Technical Support',
    'Communication',
    'Overall Service',
  ];
  
  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl mb-2">Customer Service Rating</h1>
          <p className="text-gray-600">Share your feedback about your recent engagement with our team</p>
        </div>
        
        {submitted ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="size-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="size-8 text-green-600" />
                </div>
                <h2 className="text-2xl mb-2">Thank You for Your Feedback!</h2>
                <p className="text-gray-600 mb-4">
                  Your rating has been submitted successfully. We appreciate your time and input.
                </p>
                <p className="text-sm text-gray-500">This form will reset in a moment...</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Rate Your Experience</CardTitle>
              <CardDescription>
                Help us improve our service by providing your honest feedback
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Account Selection */}
                <div className="space-y-2">
                  <Label htmlFor="account">Your Company</Label>
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger id="account">
                      <SelectValue placeholder="Select your company" />
                    </SelectTrigger>
                    <SelectContent>
                      {corporateAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Engagement Selection */}
                {selectedAccount && (
                  <div className="space-y-2">
                    <Label htmlFor="engagement">Recent Engagement</Label>
                    <Select 
                      value={selectedEngagement} 
                      onValueChange={setSelectedEngagement}
                      disabled={accountEngagements.length === 0}
                    >
                      <SelectTrigger id="engagement">
                        <SelectValue placeholder={
                          accountEngagements.length === 0 
                            ? "No completed engagements available"
                            : "Select an engagement"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {accountEngagements.map((engagement) => (
                          <SelectItem key={engagement.id} value={engagement.id}>
                            {engagement.title} ({engagement.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Executive Info Display */}
                {executive && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">Account Executive</p>
                    <p className="font-medium">{executive.name}</p>
                    <p className="text-sm text-gray-500">{executive.role}</p>
                  </div>
                )}
                
                {/* Rating Stars */}
                <div className="space-y-2">
                  <Label>Overall Rating</Label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="transition-transform hover:scale-110"
                      >
                        <Star
                          className={`size-10 ${
                            star <= (hoverRating || rating)
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      </button>
                    ))}
                    {rating > 0 && (
                      <span className="ml-2 text-gray-600">
                        {rating} out of 5 stars
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Category Selection */}
                <div className="space-y-2">
                  <Label htmlFor="category">Rating Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Feedback Textarea */}
                <div className="space-y-2">
                  <Label htmlFor="feedback">Your Feedback</Label>
                  <Textarea
                    id="feedback"
                    placeholder="Please share your experience and any suggestions for improvement..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={6}
                    className="resize-none"
                  />
                  <p className="text-sm text-gray-500">
                    {feedback.length} characters
                  </p>
                </div>
                
                {/* Submit Button */}
                <div className="flex justify-end pt-4">
                  <Button 
                    type="submit" 
                    size="lg"
                    disabled={!selectedAccount || !selectedEngagement || !rating || !category || !feedback}
                  >
                    <Send className="size-4 mr-2" />
                    Submit Rating
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        
        {/* Info Card */}
        <Card className="mt-6 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <div className="size-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                <Star className="size-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Why Your Feedback Matters</h3>
                <p className="text-sm text-gray-600">
                  Your ratings help us continuously improve our service quality and ensure our Key Account 
                  Executives are meeting your business needs. All feedback is reviewed by our management team 
                  and contributes to our performance evaluation and training programs.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
