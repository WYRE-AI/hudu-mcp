export interface McpTool {
  name: string;
  description: string;
  annotations?: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: McpTool[] = [
  // Test connection
  {
    name: 'hudu_test_connection',
    description: 'Test the connection to Hudu API',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },

  // Companies
  {
    name: 'hudu_list_companies',
    description: 'List companies in Hudu with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
        name: { type: 'string', description: 'Filter by company name' },
        id_number: { type: 'string', description: 'Filter by ID number' },
        website: { type: 'string', description: 'Filter by website' },
        phone_number: { type: 'string', description: 'Filter by phone number' },
        city: { type: 'string', description: 'Filter by city' },
        state: { type: 'string', description: 'Filter by state' },
        archived: { type: 'boolean', description: 'Filter by archived status' }
      },
      required: []
    }
  },
  {
    name: 'hudu_get_company',
    description: 'Get a company by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Company ID' } },
      required: ['id']
    }
  },
  {
    name: 'hudu_create_company',
    description: 'Create a new company in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Company name (required)' },
        nickname: { type: 'string', description: 'Company nickname' },
        company_type: { type: 'string', description: 'Company type' },
        address_line_1: { type: 'string', description: 'Address line 1' },
        address_line_2: { type: 'string', description: 'Address line 2' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        zip: { type: 'string', description: 'ZIP code' },
        country_name: { type: 'string', description: 'Country name' },
        phone_number: { type: 'string', description: 'Phone number' },
        fax_number: { type: 'string', description: 'Fax number' },
        website: { type: 'string', description: 'Website URL' },
        id_number: { type: 'string', description: 'ID number' },
        notes: { type: 'string', description: 'Notes' },
        parent_company_id: { type: 'number', description: 'Parent company ID' }
      },
      required: ['name']
    }
  },
  {
    name: 'hudu_update_company',
    description: 'Update an existing company in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Company ID' },
        name: { type: 'string', description: 'Company name' },
        nickname: { type: 'string', description: 'Company nickname' },
        company_type: { type: 'string', description: 'Company type' },
        address_line_1: { type: 'string', description: 'Address line 1' },
        address_line_2: { type: 'string', description: 'Address line 2' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        zip: { type: 'string', description: 'ZIP code' },
        country_name: { type: 'string', description: 'Country' },
        phone_number: { type: 'string', description: 'Phone number' },
        fax_number: { type: 'string', description: 'Fax number' },
        website: { type: 'string', description: 'Website URL' },
        id_number: { type: 'string', description: 'ID number' },
        notes: { type: 'string', description: 'Notes' },
        parent_company_id: { type: 'number', description: 'Parent company ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'hudu_delete_company',
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently deletes a company and all of its ' +
      'associated assets, articles, passwords, and other data. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete company (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Company ID' } },
      required: ['id']
    }
  },
  {
    name: 'hudu_archive_company',
    description:
      '⚠ HIGH-IMPACT. Archives a company, removing it from active use and hiding ' +
      'associated assets, passwords, and articles from normal operations. Reversible by unarchiving. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Archive company (reversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Company ID' } },
      required: ['id']
    }
  },
  {
    name: 'hudu_unarchive_company',
    description:
      '⚠ HIGH-IMPACT. Restores an archived company back to active use, making ' +
      'it and all associated assets, passwords, and articles visible again in normal operations. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Unarchive company (reversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Company ID' } },
      required: ['id']
    }
  },

  // Assets
  {
    name: 'hudu_list_assets',
    description: 'List assets in Hudu with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
        company_id: { type: 'number', description: 'Filter by company ID' },
        asset_layout_id: { type: 'number', description: 'Filter by asset layout ID' },
        name: { type: 'string', description: 'Filter by name' },
        primary_serial: { type: 'string', description: 'Filter by serial number' },
        archived: { type: 'boolean', description: 'Filter by archived status' }
      },
      required: []
    }
  },
  {
    name: 'hudu_get_asset',
    description: 'Get an asset by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Asset ID' } },
      required: ['id']
    }
  },
  {
    name: 'hudu_create_asset',
    description: 'Create a new asset in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        company_id: { type: 'number', description: 'Company ID (required)' },
        asset_layout_id: { type: 'number', description: 'Asset layout ID (required)' },
        name: { type: 'string', description: 'Asset name (required)' },
        primary_serial: { type: 'string', description: 'Serial number' },
        primary_model: { type: 'string', description: 'Model' },
        primary_manufacturer: { type: 'string', description: 'Manufacturer' },
        primary_mail: { type: 'string', description: 'Email' },
        custom_fields: { type: 'object', description: 'Custom field values' }
      },
      required: ['company_id', 'asset_layout_id', 'name']
    }
  },
  {
    name: 'hudu_update_asset',
    description: 'Update an existing asset in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Asset ID' },
        name: { type: 'string', description: 'Asset name' },
        company_id: { type: 'number', description: 'Company ID' },
        asset_layout_id: { type: 'number', description: 'Asset layout ID' },
        primary_serial: { type: 'string', description: 'Serial number' },
        primary_model: { type: 'string', description: 'Model' },
        primary_manufacturer: { type: 'string', description: 'Manufacturer' },
        primary_mail: { type: 'string', description: 'Email' },
        custom_fields: { type: 'object', description: 'Custom field values' }
      },
      required: ['id']
    }
  },
  {
    name: 'hudu_delete_asset',
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently deletes an asset and all of its ' +
      'associated data, passwords, and configuration information. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete asset (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Asset ID' } },
      required: ['id']
    }
  },
  {
    name: 'hudu_archive_asset',
    description:
      '⚠ HIGH-IMPACT. Archives an asset, removing it from active use and hiding ' +
      'it from normal asset listings and operations. Reversible by unarchiving. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Archive asset (reversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Asset ID' } },
      required: ['id']
    }
  },

  // Asset Layouts
  {
    name: 'hudu_list_asset_layouts',
    description: 'List asset layouts in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
        name: { type: 'string', description: 'Filter by name' }
      },
      required: []
    }
  },
  {
    name: 'hudu_get_asset_layout',
    description: 'Get an asset layout by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Asset layout ID' } },
      required: ['id']
    }
  },
  {
    name: 'hudu_create_asset_layout',
    description: 'Create a new asset layout in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Layout name (required)' },
        icon: { type: 'string', description: 'Icon' },
        color: { type: 'string', description: 'Color' },
        icon_color: { type: 'string', description: 'Icon color' },
        include_passwords: { type: 'boolean', description: 'Include passwords' },
        include_photos: { type: 'boolean', description: 'Include photos' },
        include_comments: { type: 'boolean', description: 'Include comments' },
        include_files: { type: 'boolean', description: 'Include files' },
        active: { type: 'boolean', description: 'Active status' },
        fields: { type: 'array', description: 'Layout fields', items: { type: 'object' } }
      },
      required: ['name']
    }
  },
  {
    name: 'hudu_update_asset_layout',
    description: 'Update an existing asset layout in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Asset layout ID' },
        name: { type: 'string', description: 'Layout name' },
        icon: { type: 'string', description: 'Icon' },
        color: { type: 'string', description: 'Color' },
        icon_color: { type: 'string', description: 'Icon color' },
        include_passwords: { type: 'boolean', description: 'Include passwords' },
        include_photos: { type: 'boolean', description: 'Include photos' },
        include_comments: { type: 'boolean', description: 'Include comments' },
        include_files: { type: 'boolean', description: 'Include files' },
        active: { type: 'boolean', description: 'Active status' },
        fields: { type: 'array', description: 'Layout fields', items: { type: 'object' } }
      },
      required: ['id']
    }
  },

  // Asset Passwords
  {
    name: 'hudu_list_asset_passwords',
    description: 'List asset passwords in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
        company_id: { type: 'number', description: 'Filter by company ID' },
        name: { type: 'string', description: 'Filter by name' },
        search: { type: 'string', description: 'Search term' }
      },
      required: []
    }
  },
  {
    name: 'hudu_get_asset_password',
    description: 'Get an asset password by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Asset password ID' } },
      required: ['id']
    }
  },
  {
    name: 'hudu_create_asset_password',
    description: 'Create a new asset password in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        company_id: { type: 'number', description: 'Company ID (required)' },
        name: { type: 'string', description: 'Password name (required)' },
        username: { type: 'string', description: 'Username' },
        password: { type: 'string', description: 'Password value' },
        otp_secret: { type: 'string', description: 'OTP secret' },
        url: { type: 'string', description: 'URL' },
        password_type: { type: 'string', description: 'Password type' },
        description: { type: 'string', description: 'Description' },
        passwordable_type: { type: 'string', description: 'Passwordable type' },
        passwordable_id: { type: 'number', description: 'Passwordable ID' },
        in_portal: { type: 'boolean', description: 'Show in portal' },
        password_folder_id: { type: 'number', description: 'Password folder ID' }
      },
      required: ['company_id', 'name']
    }
  },
  {
    name: 'hudu_update_asset_password',
    description: 'Update an existing asset password in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Asset password ID' },
        name: { type: 'string', description: 'Password name' },
        username: { type: 'string', description: 'Username' },
        password: { type: 'string', description: 'Password value' },
        otp_secret: { type: 'string', description: 'OTP secret' },
        url: { type: 'string', description: 'URL' },
        password_type: { type: 'string', description: 'Password type' },
        description: { type: 'string', description: 'Description' }
      },
      required: ['id']
    }
  },
  {
    name: 'hudu_delete_asset_password',
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently deletes an asset password and all ' +
      'associated authentication information. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete asset password (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Asset password ID' } },
      required: ['id']
    }
  },

  // Articles
  {
    name: 'hudu_list_articles',
    description: 'List knowledge base articles in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
        company_id: { type: 'number', description: 'Filter by company ID' },
        name: { type: 'string', description: 'Filter by name' },
        draft: { type: 'boolean', description: 'Filter by draft status' }
      },
      required: []
    }
  },
  {
    name: 'hudu_get_article',
    description: 'Get a knowledge base article by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Article ID' } },
      required: ['id']
    }
  },
  {
    name: 'hudu_create_article',
    description: 'Create a new knowledge base article in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Article name (required)' },
        content: { type: 'string', description: 'Article content (HTML)' },
        folder_id: { type: 'number', description: 'Folder ID' },
        company_id: { type: 'number', description: 'Company ID' },
        enable_sharing: { type: 'boolean', description: 'Enable sharing' },
        draft: { type: 'boolean', description: 'Draft status' }
      },
      required: ['name']
    }
  },
  {
    name: 'hudu_update_article',
    description: 'Update an existing knowledge base article in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Article ID' },
        name: { type: 'string', description: 'Article name' },
        content: { type: 'string', description: 'Article content (HTML)' },
        folder_id: { type: 'number', description: 'Folder ID' },
        company_id: { type: 'number', description: 'Company ID' },
        enable_sharing: { type: 'boolean', description: 'Enable sharing' },
        draft: { type: 'boolean', description: 'Draft status' }
      },
      required: ['id']
    }
  },
  {
    name: 'hudu_delete_article',
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently deletes a knowledge base article and all ' +
      'its content, attachments, and version history. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete article (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Article ID' } },
      required: ['id']
    }
  },
  {
    name: 'hudu_archive_article',
    description:
      '⚠ HIGH-IMPACT. Archives a knowledge base article, removing it from active use ' +
      'and hiding it from normal article listings and search results. Reversible by unarchiving. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Archive article (reversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Article ID' } },
      required: ['id']
    }
  },

  // Websites
  {
    name: 'hudu_list_websites',
    description: 'List monitored websites in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
        name: { type: 'string', description: 'Filter by name' },
        company_id: { type: 'number', description: 'Filter by company ID' }
      },
      required: []
    }
  },
  {
    name: 'hudu_get_website',
    description: 'Get a website by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Website ID' } },
      required: ['id']
    }
  },
  {
    name: 'hudu_create_website',
    description: 'Create a new website in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Website name (required)' },
        url: { type: 'string', description: 'Website URL' },
        notes: { type: 'string', description: 'Notes' },
        paused: { type: 'boolean', description: 'Paused status' },
        company_id: { type: 'number', description: 'Company ID' },
        disable_dns: { type: 'boolean', description: 'Disable DNS monitoring' },
        disable_ssl: { type: 'boolean', description: 'Disable SSL monitoring' },
        disable_whois: { type: 'boolean', description: 'Disable WHOIS monitoring' }
      },
      required: ['name']
    }
  },
  {
    name: 'hudu_update_website',
    description: 'Update an existing website in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Website ID' },
        name: { type: 'string', description: 'Website name' },
        url: { type: 'string', description: 'Website URL' },
        notes: { type: 'string', description: 'Notes' },
        paused: { type: 'boolean', description: 'Paused status' },
        company_id: { type: 'number', description: 'Company ID' },
        disable_dns: { type: 'boolean', description: 'Disable DNS monitoring' },
        disable_ssl: { type: 'boolean', description: 'Disable SSL monitoring' },
        disable_whois: { type: 'boolean', description: 'Disable WHOIS monitoring' }
      },
      required: ['id']
    }
  },
  {
    name: 'hudu_delete_website',
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently deletes a website and all ' +
      'its monitoring history, SSL certificates, and DNS records data. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete website (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Website ID' } },
      required: ['id']
    }
  },

  // Folders
  {
    name: 'hudu_list_folders',
    description: 'List folders in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
        company_id: { type: 'number', description: 'Filter by company ID' },
        name: { type: 'string', description: 'Filter by name' }
      },
      required: []
    }
  },

  // Procedures
  {
    name: 'hudu_list_procedures',
    description: 'List procedures in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
        company_id: { type: 'number', description: 'Filter by company ID' },
        name: { type: 'string', description: 'Filter by name' }
      },
      required: []
    }
  },

  // Activity Logs
  {
    name: 'hudu_list_activity_logs',
    description: 'List activity logs in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
        user_id: { type: 'number', description: 'Filter by user ID' },
        user_email: { type: 'string', description: 'Filter by user email' },
        resource_id: { type: 'number', description: 'Filter by resource ID' },
        resource_type: { type: 'string', description: 'Filter by resource type' },
        action_message: { type: 'string', description: 'Filter by action message' },
        start_date: { type: 'string', description: 'Filter by start date (ISO format)' }
      },
      required: []
    }
  },

  // Relations
  {
    name: 'hudu_list_relations',
    description: 'List relations in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' }
      },
      required: []
    }
  },

  // Magic Dash
  {
    name: 'hudu_list_magic_dash',
    description: 'List Magic Dash items in Hudu',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
        company_id: { type: 'number', description: 'Filter by company ID' },
        title: { type: 'string', description: 'Filter by title' }
      },
      required: []
    }
  }
];
