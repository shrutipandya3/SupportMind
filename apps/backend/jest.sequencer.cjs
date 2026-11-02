const TestSequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends TestSequencer {
  sort(tests) {
    // Define your exact order of execution here
    const orderedFiles = [
      'createChat.test.ts',
      'sendMessage.test.ts',
      'getChatById.test.ts',
      'getChats.test.ts',
      'updateChatTitle.test.ts'
    ];

    return Array.from(tests).sort((testA, testB) => {
      const indexA = orderedFiles.findIndex(name => testA.path.endsWith(name));
      const indexB = orderedFiles.findIndex(name => testB.path.endsWith(name));

      // If both files are in our explicit list, sort by their defined index
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      // If only A is in the list, A comes first
      if (indexA !== -1) return -1;
      // If only B is in the list, B comes first
      if (indexB !== -1) return 1;
      
      // For any future/unlisted test files, fall back to alphabetical order
      return testA.path.localeCompare(testB.path);
    });
  }
}

module.exports = CustomSequencer;