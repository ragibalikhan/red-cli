import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from './anthropic.js';

export class BedrockProvider extends AnthropicProvider {
  constructor(config) {
    super(config);
    const region = config.awsRegion || process.env.AWS_REGION || 'us-east-1';
    const apiKey = config.bedrockApiKey || config.apiKeys?.bedrock || process.env.AWS_BEDROCK_API_KEY || process.env.ANTHROPIC_API_KEY;
    const baseURL = config.bedrockBaseUrl || process.env.ANTHROPIC_BASE_URL || `https://bedrock-mantle.${region}.api.aws/anthropic`;

    this.client = new Anthropic({
      apiKey,
      baseURL
    });
  }
}

export default BedrockProvider;
