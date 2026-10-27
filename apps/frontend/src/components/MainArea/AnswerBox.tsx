import { memo } from 'react';
import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { CONTENT_WIDTH } from '../layout/messageLayout';

interface AnswerBoxProps {
  content: string;
}

function AnswerBox({ content }: AnswerBoxProps) {
  return (
    <Box
      sx={{
        width: CONTENT_WIDTH,
        maxWidth: '100%',
        mx: 'auto',
        textAlign: 'left',
        typography: 'body1',
        overflowWrap: 'anywhere', // wrap long words and URLs
        '& > :first-child': { mt: 0 },
        '& > :last-child': { mb: 0 },
        '& p': { my: 1 },
        '& ul, & ol': { listStylePosition: 'inside', pl: 0 }, // markers stay with the centered text
        '& img': { maxWidth: '100%' },
        // Code blocks: left-aligned and scroll horizontally instead of wrapping
        '& pre': {
          textAlign: 'left',
          overflowX: 'auto',
          overflowWrap: 'normal',
          p: 1.5,
          borderRadius: 1,
          bgcolor: 'action.hover',
        },
        '& code': { fontFamily: 'monospace', fontSize: '0.875em' },
        '& :not(pre) > code': { px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' },
      }}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </Box>
  );
}

// memo: during streaming only the last answer changes, so finished answers aren't re-parsed per chunk
export default memo(AnswerBox);