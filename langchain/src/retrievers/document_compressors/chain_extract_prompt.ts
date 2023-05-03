export const PROMPT_TEMPLATE = (
  noOutputString: string
) => `Given the following question and context, extract any part of the context *AS IS* that is relevant to answer the question. If none of the context is relevant return ${noOutputString}.

Remember, *DO NOT* edit the extracted parts of the context.

> Question: {question}
> Context:
>>>
{context}
>>>
Extracted relevant parts:`;
