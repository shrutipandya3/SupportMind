import { memo } from 'react';
import { Box, Paper } from '@mui/material';
import { QUESTION_WIDTH } from '../layout/messageLayout';

interface QuestionBoxProps {
  content: string;
}

function QuestionBox({ content }: QuestionBoxProps) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Paper
        elevation={0}
        sx={{
          width: QUESTION_WIDTH,
          maxWidth: '100%',
          p: 1.5,
          borderRadius: 2,
          bgcolor: 'action.hover',
          textAlign: 'left',
          whiteSpace: 'pre-wrap', // keep the user's line breaks
          overflowWrap: 'anywhere', // break very long words/URLs instead of overflowing
          maxHeight: 240, // very long questions scroll inside the box
          overflowY: 'auto',
        }}
      >
        {content}
      </Paper>
    </Box>
  );
}

export default memo(QuestionBox);