/**
 * Service for interacting with local ComfyUI instances
 */

/**
 * Converts a standard ComfyUI UI workflow (the one with 'nodes' array) 
 * to the API format that the /prompt endpoint expects.
 */
const convertUiToApi = (uiWorkflow: any): any => {
    const apiPrompt: any = {};
    
    if (!uiWorkflow.nodes || !Array.isArray(uiWorkflow.nodes)) {
        return uiWorkflow; // Already in API format or unknown
    }

    uiWorkflow.nodes.forEach((node: any) => {
        const nodeId = node.id.toString();
        const inputs: any = {};
        
        // Map inputs based on links
        if (uiWorkflow.links && node.inputs) {
            node.inputs.forEach((input: any) => { // Removed unused 'index' parameter
                const linkId = input.link;
                if (linkId) {
                    const link = uiWorkflow.links.find((l: any) => l[0] === linkId);
                    if (link) {
                        // link format: [id, origin_id, origin_slot, target_id, target_slot, type]
                        inputs[input.name] = [link[1].toString(), link[2]];
                    }
                }
            });
        }

        // Map widgets to inputs
        // This is a simplified mapping; standard nodes usually have widgets in a specific order
        if (node.widgets_values && Array.isArray(node.widgets_values)) {
            // Note: This mapping is brittle as it depends on node implementation, 
            // but for standard nodes it often works.
            // We'll primarily rely on the explicit injection logic later.
            node.widgets_values.forEach((val: any, idx: number) => {
                // We don't strictly know the keys here without the node definition,
                // but we store them to be safe.
                inputs[`_widget_${idx}`] = val;
            });
        }

        apiPrompt[nodeId] = {
            class_type: node.type,
            inputs: inputs,
            _meta: { title: node.title || node.type }
        };
    });

    return apiPrompt;
};

export const sendComfyPrompt = async (
    serverUrl: string,
    workflow: any,
    promptText: string,
    seed: number,
    steps: number,
    useSecureBridge: boolean = false,
    signal?: AbortSignal
): Promise<string> => {
    const baseUrl = serverUrl.replace(/\/+$/, '');
    console.log(`[ComfyUI] Starting preview. Bridge: ${useSecureBridge}, Target: ${baseUrl}`);

    // 1. Prepare Workflow
    let apiPrompt: any = {};
    const isUiFormat = workflow.nodes && Array.isArray(workflow.nodes);

    if (isUiFormat) {
        console.log("[ComfyUI] Standard UI format detected. Attempting internal mapping...");
        // For standard UI format, we'll try to find the nodes by type and title
        apiPrompt = JSON.parse(JSON.stringify(workflow)); // Work on a copy
        
        let promptNode = apiPrompt.nodes.find((n: any) => 
            n.type === 'CLIPTextEncode' && 
            ((n.title || "").toLowerCase().includes("positive") || !(n.title || "").toLowerCase().includes("negative"))
        );
        let samplerNode = apiPrompt.nodes.find((n: any) => n.type === 'KSampler' || n.type === 'KSamplerAdvanced');

        if (promptNode) {
            // In UI format, prompt is usually the first widget
            if (promptNode.widgets_values) promptNode.widgets_values[0] = promptText;
        }
        if (samplerNode && samplerNode.widgets_values) {
            if (seed !== -1) samplerNode.widgets_values[0] = seed;
            if (steps !== -1) samplerNode.widgets_values[2] = steps;
        }

        // IMPORTANT: The /prompt endpoint REQUIRES API format. 
        // If we have UI format, we MUST convert it or it will fail.
        apiPrompt = convertUiToApi(apiPrompt);
    } else {
        apiPrompt = JSON.parse(JSON.stringify(workflow));
        // Identify nodes in API format
        let promptNodeId = '';
        let samplerNodeId = '';
        for (const id in apiPrompt) {
            const node = apiPrompt[id];
            const type = node.class_type;
            const title = (node._meta?.title || "").toLowerCase();
            if (!promptNodeId && type === 'CLIPTextEncode' && (title.includes('positive') || !title.includes('negative'))) promptNodeId = id;
            if (!samplerNodeId && (type === 'KSampler' || type === 'KSamplerAdvanced')) samplerNodeId = id;
        }
        if (promptNodeId) apiPrompt[promptNodeId].inputs.text = promptText;
        if (samplerNodeId) {
            if (seed !== -1) apiPrompt[samplerNodeId].inputs.seed = seed;
            if (steps !== -1) apiPrompt[samplerNodeId].inputs.steps = steps;
        }
    }

    // 2. Determine Endpoint
    let fetchUrl = `${baseUrl}/prompt`;
    let fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

    if (useSecureBridge) {
        fetchUrl = `${window.location.origin}/comfy-bridge/prompt`;
        fetchHeaders['x-bridge-target'] = baseUrl;
    }

    // 3. Send Request
    const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({ prompt: apiPrompt }),
        signal
    }).catch(err => {
        if (err.name === 'AbortError') throw err;
        throw new Error(`Connection failed: ${err.message}. Ensure your ComfyUI server or Bridge is reachable.`);
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server Error (${response.status}): ${errText.substring(0, 100)}...`);
    }
    
    const { prompt_id } = await response.json();
    
    // 4. Poll
    const pollUrl = useSecureBridge ? `${window.location.origin}/comfy-bridge/history/${prompt_id}` : `${baseUrl}/history/${prompt_id}`;
    const pollHeaders: HeadersInit = useSecureBridge ? { 'x-bridge-target': baseUrl } : {}; // Added explicit HeadersInit type
    
    for (let i = 0; i < 60; i++) {
        if (signal?.aborted) throw new Error("Aborted");
        
        const hRes = await fetch(pollUrl, { headers: pollHeaders, signal });
        if (hRes.ok) {
            const history = await hRes.json();
            if (history[prompt_id]) {
                const outputs = history[prompt_id].outputs;
                for (const nodeId in outputs) {
                    if (outputs[nodeId].images?.length > 0) {
                        const img = outputs[nodeId].images[0];
                        let finalUrl = useSecureBridge 
                            ? `${window.location.origin}/comfy-bridge/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}&target_base=${encodeURIComponent(baseUrl)}`
                            : `${baseUrl}/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`;
                        return finalUrl;
                    }
                }
            }
        }
        await new Promise(r => setTimeout(r, 3000));
    }

    throw new Error("Preview generation timed out.");
};