export {
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  listPeople,
  getPerson,
  createPerson,
  listOpportunities,
  getOpportunity,
  healthCheck,
  TwentyApiError,
} from './client'

export type {
  TwentyCompany,
  TwentyPerson,
  TwentyOpportunity,
  TwentyLink,
  TwentyAddress,
  TwentyCurrency,
  TwentyPageInfo,
  TwentyListResponse,
  TwentyQueryOptions,
  CreateCompanyInput,
} from './client'
