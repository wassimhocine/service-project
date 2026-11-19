/**
 * Central OpenAPI 3.0 document for the ServiceFlow API.
 *
 * Keeping the document in one module (instead of scanning JSDoc comments at
 * runtime) means it also works inside the production Docker image, where only
 * `dist` and `prisma` are copied and the TypeScript sources are absent.
 */

const json = (schema: object) => ({
  content: { "application/json": { schema } },
});

const errorResponse = (description: string) => ({
  description,
  ...json({ $ref: "#/components/schemas/Error" }),
});

const ok = (description: string, schema: object) => ({
  description,
  ...json(schema),
});

const unauthorized = errorResponse("Authentication is required");
const forbidden = errorResponse("The caller is not allowed to perform this action");
const notFound = errorResponse("The requested record was not found in this business");
const conflict = errorResponse("The request conflicts with the current state");
const validationError = errorResponse("The request payload or query is invalid");

const uuid = { type: "string", format: "uuid" } as const;

const businessIdParam = {
  name: "id",
  in: "path",
  required: true,
  description: "Business ID",
  schema: uuid,
};

const memberIdParam = {
  name: "memberId",
  in: "path",
  required: true,
  description: "Business membership ID",
  schema: uuid,
};

const customerIdParam = {
  name: "customerId",
  in: "path",
  required: true,
  description: "Customer ID",
  schema: uuid,
};

const staffIdParam = {
  name: "staffId",
  in: "path",
  required: true,
  description: "Staff membership ID",
  schema: uuid,
};

const serviceIdParam = {
  name: "serviceId",
  in: "path",
  required: true,
  description: "Service ID",
  schema: uuid,
};

const appointmentIdParam = {
  name: "appointmentId",
  in: "path",
  required: true,
  description: "Appointment ID",
  schema: uuid,
};

const exceptionIdParam = {
  name: "exceptionId",
  in: "path",
  required: true,
  description: "Schedule exception ID",
  schema: uuid,
};

const pageParam = {
  name: "page",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, default: 1 },
};

const limitParam = {
  name: "limit",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
};

const paginationSchema = {
  type: "object",
  required: ["total", "page", "limit", "totalPages"],
  properties: {
    total: { type: "integer" },
    page: { type: "integer" },
    limit: { type: "integer" },
    totalPages: { type: "integer" },
  },
};

const paginated = (itemRef: string) => ({
  type: "object",
  required: ["data", "pagination"],
  properties: {
    data: { type: "array", items: { $ref: itemRef } },
    pagination: { $ref: "#/components/schemas/Pagination" },
  },
});

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "ServiceFlow API",
    version: "1.1.0",
    description:
      "Multi-tenant appointment booking API. All business and booking operations require an authenticated account.",
  },
  servers: [
    { url: "/api/v1", description: "Versioned API" },
    { url: "/", description: "Unversioned alias" },
  ],
  tags: [
    { name: "Auth", description: "Registration and login" },
    { name: "Businesses", description: "Business profiles and memberships" },
    { name: "Customers", description: "Customer records owned by a business" },
    { name: "Staff", description: "Staff memberships, service assignments and schedules" },
    { name: "Services", description: "Services offered by a business" },
    { name: "Scheduling", description: "Working hours, exceptions and availability" },
    { name: "Appointments", description: "Authenticated booking and appointment management" },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    parameters: {
      BusinessId: businessIdParam,
      MemberId: memberIdParam,
      CustomerId: customerIdParam,
      StaffId: staffIdParam,
      ServiceId: serviceIdParam,
      AppointmentId: appointmentIdParam,
      ExceptionId: exceptionIdParam,
      Page: pageParam,
      Limit: limitParam,
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      Pagination: paginationSchema,
      User: {
        type: "object",
        required: ["id", "email", "firstName", "lastName", "status"],
        properties: {
          id: uuid,
          email: { type: "string", format: "email" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          phone: { type: "string", nullable: true },
          status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] },
        },
      },
      AuthResponse: {
        type: "object",
        required: ["token", "user"],
        properties: {
          token: { type: "string" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      Business: {
        type: "object",
        properties: {
          id: uuid,
          name: { type: "string" },
          slug: { type: "string" },
          description: { type: "string", nullable: true },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          address: { type: "string", nullable: true },
          timezone: { type: "string" },
          currency: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Membership: {
        type: "object",
        properties: {
          id: uuid,
          userId: uuid,
          businessId: uuid,
          role: { type: "string", enum: ["OWNER", "MANAGER", "STAFF"] },
          status: { type: "string", enum: ["INVITED", "ACTIVE", "SUSPENDED"] },
          user: { $ref: "#/components/schemas/User" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Customer: {
        type: "object",
        properties: {
          id: uuid,
          businessId: uuid,
          userId: { ...uuid, nullable: true },
          firstName: { type: "string" },
          lastName: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          notes: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Service: {
        type: "object",
        properties: {
          id: uuid,
          businessId: uuid,
          name: { type: "string" },
          description: { type: "string", nullable: true },
          durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
          price: { type: "string", example: "45.50" },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      StaffMember: {
        type: "object",
        properties: {
          id: uuid,
          userId: uuid,
          businessId: uuid,
          role: { type: "string", enum: ["STAFF"] },
          status: { type: "string", enum: ["INVITED", "ACTIVE", "SUSPENDED"] },
          user: { $ref: "#/components/schemas/User" },
          staffServices: {
            type: "array",
            items: {
              type: "object",
              properties: {
                serviceId: uuid,
                service: { $ref: "#/components/schemas/Service" },
              },
            },
          },
          workingHours: {
            type: "array",
            items: { $ref: "#/components/schemas/StaffWorkingHoursEntry" },
          },
        },
      },
      StaffWorkingHoursEntry: {
        type: "object",
        properties: {
          dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
          startTime: { type: "string", nullable: true, example: "09:00" },
          endTime: { type: "string", nullable: true, example: "17:00" },
          isOff: { type: "boolean" },
        },
      },
      BusinessWorkingHoursEntry: {
        type: "object",
        required: ["dayOfWeek", "isClosed"],
        properties: {
          dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
          day: { type: "string", example: "Monday" },
          startTime: { type: "string", nullable: true, example: "09:00" },
          endTime: { type: "string", nullable: true, example: "17:00" },
          isClosed: { type: "boolean" },
        },
      },
      WorkingHoursResponse: {
        type: "object",
        required: ["timezone", "schedule"],
        properties: {
          timezone: { type: "string", example: "Europe/London" },
          schedule: {
            type: "array",
            minItems: 7,
            maxItems: 7,
            items: { $ref: "#/components/schemas/BusinessWorkingHoursEntry" },
          },
        },
      },
      ScheduleException: {
        type: "object",
        properties: {
          id: uuid,
          businessId: uuid,
          staffId: { ...uuid, nullable: true },
          date: { type: "string", format: "date", example: "2027-03-01" },
          type: {
            type: "string",
            enum: ["TIME_OFF", "SPECIAL_HOURS", "HOLIDAY"],
          },
          startTime: { type: "string", nullable: true, example: "14:00" },
          endTime: { type: "string", nullable: true, example: "15:00" },
          reason: { type: "string", nullable: true },
        },
      },
      Appointment: {
        type: "object",
        properties: {
          id: uuid,
          businessId: uuid,
          customerId: uuid,
          staffId: uuid,
          serviceId: uuid,
          startTime: { type: "string", format: "date-time" },
          endTime: { type: "string", format: "date-time" },
          durationMinutes: { type: "integer" },
          price: { type: "string", example: "30.00" },
          status: {
            type: "string",
            enum: ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"],
          },
          notes: { type: "string", nullable: true },
          cancelledAt: { type: "string", format: "date-time", nullable: true },
          completedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          customer: { $ref: "#/components/schemas/Customer" },
          service: { $ref: "#/components/schemas/Service" },
          staff: { $ref: "#/components/schemas/StaffMember" },
        },
      },
      AvailabilityResponse: {
        type: "object",
        required: ["date", "timezone", "service", "slots"],
        properties: {
          date: { type: "string", format: "date" },
          timezone: { type: "string" },
          service: {
            type: "object",
            properties: {
              id: uuid,
              name: { type: "string" },
              durationMinutes: { type: "integer" },
              price: { type: "string" },
            },
          },
          staffId: { ...uuid, description: "Present when the query targeted one staff member" },
          slots: {
            type: "array",
            items: {
              type: "object",
              required: ["startTime", "endTime", "staffIds"],
              properties: {
                startTime: { type: "string", format: "date-time" },
                endTime: { type: "string", format: "date-time" },
                staffIds: { type: "array", items: uuid },
              },
            },
          },
        },
      },
      PaginatedServices: paginated("#/components/schemas/Service"),
      PaginatedCustomers: paginated("#/components/schemas/Customer"),
      PaginatedStaff: paginated("#/components/schemas/StaffMember"),
      PaginatedAppointments: paginated("#/components/schemas/Appointment"),
      PaginatedExceptions: paginated("#/components/schemas/ScheduleException"),
      RegisterRequest: {
        type: "object",
        required: ["email", "password", "firstName", "lastName"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          firstName: { type: "string", maxLength: 100 },
          lastName: { type: "string", maxLength: 100 },
          phone: { type: "string", maxLength: 30 },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
      CreateBusinessRequest: {
        type: "object",
        required: ["name", "email", "phone"],
        properties: {
          name: { type: "string", maxLength: 200 },
          slug: { type: "string", maxLength: 120, example: "my-salon" },
          description: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string", maxLength: 30 },
          address: { type: "string" },
          timezone: { type: "string", maxLength: 64, example: "Europe/London" },
          currency: { type: "string", minLength: 3, maxLength: 3, example: "USD" },
        },
      },
      UpdateBusinessRequest: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 200 },
          slug: { type: "string", maxLength: 120 },
          description: { type: "string", nullable: true },
          email: { type: "string", format: "email" },
          phone: { type: "string", maxLength: 30 },
          address: { type: "string", nullable: true },
          timezone: { type: "string", maxLength: 64 },
          currency: { type: "string", minLength: 3, maxLength: 3 },
          status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] },
        },
      },
      AddMemberRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["OWNER", "MANAGER", "STAFF"], default: "STAFF" },
          status: {
            type: "string",
            enum: ["INVITED", "ACTIVE", "SUSPENDED"],
            default: "INVITED",
          },
        },
      },
      UpdateMemberRequest: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["OWNER", "MANAGER", "STAFF"] },
          status: { type: "string", enum: ["INVITED", "ACTIVE", "SUSPENDED"] },
        },
      },
      CreateCustomerRequest: {
        type: "object",
        required: ["firstName", "lastName", "email", "phone"],
        properties: {
          firstName: { type: "string", maxLength: 100 },
          lastName: { type: "string", maxLength: 100 },
          email: { type: "string", format: "email" },
          phone: { type: "string", maxLength: 30 },
          notes: { type: "string" },
          userId: { ...uuid, description: "Link the customer record to a platform user" },
        },
      },
      UpdateCustomerRequest: {
        type: "object",
        properties: {
          firstName: { type: "string", maxLength: 100 },
          lastName: { type: "string", maxLength: 100 },
          email: { type: "string", format: "email" },
          phone: { type: "string", maxLength: 30 },
          notes: { type: "string", nullable: true },
          userId: { ...uuid, nullable: true },
        },
      },
      AddStaffRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
          status: { type: "string", enum: ["INVITED", "ACTIVE"], default: "ACTIVE" },
        },
      },
      UpdateProfileRequest: {
        type: "object",
        properties: {
          firstName: { type: "string", maxLength: 100 },
          lastName: { type: "string", maxLength: 100 },
          phone: { type: "string", maxLength: 30, nullable: true },
        },
      },
      UpdateStaffRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["INVITED", "ACTIVE", "SUSPENDED"] },
        },
      },
      AssignServicesRequest: {
        type: "object",
        required: ["serviceIds"],
        properties: {
          serviceIds: { type: "array", maxItems: 200, items: uuid },
        },
      },
      StaffScheduleRequest: {
        type: "object",
        required: ["schedule"],
        properties: {
          schedule: {
            type: "array",
            maxItems: 7,
            items: {
              type: "object",
              required: ["dayOfWeek"],
              properties: {
                dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
                startTime: { type: "string", example: "09:00" },
                endTime: { type: "string", example: "17:00" },
                isOff: { type: "boolean", default: false },
              },
            },
          },
        },
      },
      CreateServiceRequest: {
        type: "object",
        required: ["name", "durationMinutes", "price"],
        properties: {
          name: { type: "string", maxLength: 200 },
          description: { type: "string" },
          durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
          price: {
            oneOf: [{ type: "string" }, { type: "number" }],
            example: "45.50",
          },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
        },
      },
      UpdateServiceRequest: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 200 },
          description: { type: "string", nullable: true },
          durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
          price: { oneOf: [{ type: "string" }, { type: "number" }] },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
        },
      },
      UpdateWorkingHoursRequest: {
        type: "object",
        required: ["schedule"],
        properties: {
          schedule: {
            type: "array",
            maxItems: 7,
            description:
              "Replace the full weekly schedule. Days omitted from the array are treated as closed.",
            items: {
              type: "object",
              required: ["dayOfWeek"],
              properties: {
                dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
                startTime: { type: "string", example: "09:00" },
                endTime: { type: "string", example: "17:00" },
                isClosed: { type: "boolean", default: false },
              },
            },
          },
        },
      },
      CreateExceptionRequest: {
        type: "object",
        required: ["date", "type"],
        properties: {
          staffId: {
            ...uuid,
            nullable: true,
            description: "Omit for a business-wide exception",
          },
          date: { type: "string", format: "date", example: "2027-03-01" },
          type: {
            type: "string",
            enum: ["TIME_OFF", "SPECIAL_HOURS", "HOLIDAY"],
          },
          startTime: { type: "string", example: "14:00" },
          endTime: { type: "string", example: "15:00" },
          reason: { type: "string", maxLength: 500 },
        },
      },
      CreateAppointmentRequest: {
        type: "object",
        required: ["serviceId", "startTime"],
        properties: {
          customerId: {
            ...uuid,
            description:
              "Required when a business member books on behalf of a customer; " +
              "ignored for customers booking themselves.",
          },
          serviceId: uuid,
          staffId: {
            ...uuid,
            description:
              "Optional; when omitted the first available staff member is chosen.",
          },
          startTime: { type: "string", format: "date-time" },
          notes: { type: "string", maxLength: 2000 },
        },
      },
      UpdateAppointmentRequest: {
        type: "object",
        properties: {
          notes: { type: "string", maxLength: 2000, nullable: true },
          status: {
            type: "string",
            enum: ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"],
          },
        },
      },
      RescheduleAppointmentRequest: {
        type: "object",
        required: ["startTime"],
        properties: {
          startTime: { type: "string", format: "date-time" },
        },
      },
    },
    responses: {
      Unauthorized: unauthorized,
      Forbidden: forbidden,
      NotFound: notFound,
      Conflict: conflict,
      ValidationError: validationError,
    },
  },
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a user account",
        security: [],
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/RegisterRequest" }),
        },
        responses: {
          201: ok("Account created", { $ref: "#/components/schemas/AuthResponse" }),
          400: { $ref: "#/components/responses/ValidationError" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Sign in and receive a JWT",
        security: [],
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/LoginRequest" }),
        },
        responses: {
          200: ok("Authenticated", { $ref: "#/components/schemas/AuthResponse" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out the current user",
        responses: {
          200: ok("Logged out", {
            type: "object",
            properties: { message: { type: "string" } },
          }),
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the currently authenticated user profile",
        responses: {
          200: ok("Current user", { $ref: "#/components/schemas/User" }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      patch: {
        tags: ["Auth"],
        summary: "Update the currently authenticated user profile",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/UpdateProfileRequest" }),
        },
        responses: {
          200: ok("Updated user", { $ref: "#/components/schemas/User" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/businesses": {
      get: {
        tags: ["Businesses"],
        summary: "List the businesses the caller belongs to",
        responses: {
          200: ok("Businesses", {
            type: "array",
            items: { $ref: "#/components/schemas/Business" },
          }),
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Businesses"],
        summary: "Create a business (the caller becomes the owner)",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/CreateBusinessRequest" }),
        },
        responses: {
          201: ok("Business created", { $ref: "#/components/schemas/Business" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}": {
      parameters: [businessIdParam],
      get: {
        tags: ["Businesses"],
        summary: "Get a business",
        responses: {
          200: ok("Business", { $ref: "#/components/schemas/Business" }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Businesses"],
        summary: "Update a business (owner only)",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/UpdateBusinessRequest" }),
        },
        responses: {
          200: ok("Business updated", { $ref: "#/components/schemas/Business" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/members": {
      parameters: [businessIdParam],
      get: {
        tags: ["Businesses"],
        summary: "List business memberships",
        responses: {
          200: ok("Memberships", {
            type: "array",
            items: { $ref: "#/components/schemas/Membership" },
          }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Businesses"],
        summary: "Add an existing user to the business",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/AddMemberRequest" }),
        },
        responses: {
          201: ok("Membership created", { $ref: "#/components/schemas/Membership" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/members/{memberId}": {
      parameters: [businessIdParam, memberIdParam],
      patch: {
        tags: ["Businesses"],
        summary: "Update a member's role or status",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/UpdateMemberRequest" }),
        },
        responses: {
          200: ok("Membership updated", { $ref: "#/components/schemas/Membership" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/customers": {
      parameters: [businessIdParam],
      get: {
        tags: ["Customers"],
        summary: "List customers",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          pageParam,
          limitParam,
        ],
        responses: {
          200: ok("Customers", {
            $ref: "#/components/schemas/PaginatedCustomers",
          }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Customers"],
        summary: "Create a customer record",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/CreateCustomerRequest" }),
        },
        responses: {
          201: ok("Customer created", { $ref: "#/components/schemas/Customer" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/customers/{customerId}": {
      parameters: [businessIdParam, customerIdParam],
      get: {
        tags: ["Customers"],
        summary: "Get a customer",
        responses: {
          200: ok("Customer", { $ref: "#/components/schemas/Customer" }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Customers"],
        summary: "Update a customer",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/UpdateCustomerRequest" }),
        },
        responses: {
          200: ok("Customer updated", { $ref: "#/components/schemas/Customer" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/businesses/{id}/staff": {
      parameters: [businessIdParam],
      get: {
        tags: ["Staff"],
        summary: "List staff members",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["INVITED", "ACTIVE", "SUSPENDED"] },
          },
          pageParam,
          limitParam,
        ],
        responses: {
          200: ok("Staff", { $ref: "#/components/schemas/PaginatedStaff" }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Staff"],
        summary: "Add an existing user as a staff member",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/AddStaffRequest" }),
        },
        responses: {
          201: ok("Staff member created", { $ref: "#/components/schemas/StaffMember" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/staff/{staffId}": {
      parameters: [businessIdParam, staffIdParam],
      get: {
        tags: ["Staff"],
        summary: "Get a staff member",
        responses: {
          200: ok("Staff member", { $ref: "#/components/schemas/StaffMember" }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Staff"],
        summary: "Update a staff member",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/UpdateStaffRequest" }),
        },
        responses: {
          200: ok("Staff member updated", { $ref: "#/components/schemas/StaffMember" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/businesses/{id}/staff/{staffId}/services": {
      parameters: [businessIdParam, staffIdParam],
      put: {
        tags: ["Staff"],
        summary: "Replace the services a staff member provides",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/AssignServicesRequest" }),
        },
        responses: {
          200: ok("Assignments replaced", { $ref: "#/components/schemas/StaffMember" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/businesses/{id}/staff/{staffId}/schedule": {
      parameters: [businessIdParam, staffIdParam],
      put: {
        tags: ["Staff"],
        summary:
          "Replace a staff member's weekly schedule. Sending an empty array makes the " +
          "staff member inherit the business hours.",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/StaffScheduleRequest" }),
        },
        responses: {
          200: ok("Schedule replaced", { $ref: "#/components/schemas/StaffMember" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/businesses/{id}/services": {
      parameters: [businessIdParam],
      get: {
        tags: ["Services"],
        summary: "List services",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
          },
          pageParam,
          limitParam,
        ],
        responses: {
          200: ok("Services", { $ref: "#/components/schemas/PaginatedServices" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Services"],
        summary: "Create a service (owner or manager)",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/CreateServiceRequest" }),
        },
        responses: {
          201: ok("Service created", { $ref: "#/components/schemas/Service" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/businesses/{id}/services/{serviceId}": {
      parameters: [businessIdParam, serviceIdParam],
      get: {
        tags: ["Services"],
        summary: "Get a service",
        responses: {
          200: ok("Service", { $ref: "#/components/schemas/Service" }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Services"],
        summary: "Update a service (owner or manager)",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/UpdateServiceRequest" }),
        },
        responses: {
          200: ok("Service updated", { $ref: "#/components/schemas/Service" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Services"],
        summary: "Deactivate a service (soft delete)",
        responses: {
          200: ok("Service deactivated", { $ref: "#/components/schemas/Service" }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/businesses/{id}/working-hours": {
      parameters: [businessIdParam],
      get: {
        tags: ["Scheduling"],
        summary: "Get the business weekly schedule",
        responses: {
          200: ok("Working hours", {
            $ref: "#/components/schemas/WorkingHoursResponse",
          }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      put: {
        tags: ["Scheduling"],
        summary: "Replace the business weekly schedule (owner or manager)",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/UpdateWorkingHoursRequest" }),
        },
        responses: {
          200: ok("Working hours replaced", {
            $ref: "#/components/schemas/WorkingHoursResponse",
          }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/businesses/{id}/exceptions": {
      parameters: [businessIdParam],
      get: {
        tags: ["Scheduling"],
        summary: "List schedule exceptions",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "staffId", in: "query", schema: uuid },
          {
            name: "type",
            in: "query",
            schema: {
              type: "string",
              enum: ["TIME_OFF", "SPECIAL_HOURS", "HOLIDAY"],
            },
          },
          pageParam,
          limitParam,
        ],
        responses: {
          200: ok("Exceptions", {
            $ref: "#/components/schemas/PaginatedExceptions",
          }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Scheduling"],
        summary: "Create a schedule exception (owner or manager)",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/CreateExceptionRequest" }),
        },
        responses: {
          201: ok("Exception created", {
            $ref: "#/components/schemas/ScheduleException",
          }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/exceptions/{exceptionId}": {
      parameters: [businessIdParam, exceptionIdParam],
      delete: {
        tags: ["Scheduling"],
        summary: "Delete a schedule exception (owner or manager)",
        responses: {
          200: ok("Exception deleted", {
            $ref: "#/components/schemas/ScheduleException",
          }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/businesses/{id}/availability": {
      parameters: [businessIdParam],
      get: {
        tags: ["Scheduling"],
        summary: "Calculate available slots for a date and service",
        parameters: [
          {
            name: "date",
            in: "query",
            required: true,
            schema: { type: "string", format: "date" },
          },
          { name: "serviceId", in: "query", required: true, schema: uuid },
          {
            name: "staffId",
            in: "query",
            required: false,
            description:
              "Omit to union the slots of every active staff member who provides the service",
            schema: uuid,
          },
        ],
        responses: {
          200: ok("Availability", {
            $ref: "#/components/schemas/AvailabilityResponse",
          }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/appointments": {
      parameters: [businessIdParam],
      get: {
        tags: ["Appointments"],
        summary:
          "List appointments. Customers see their own, staff see their own, " +
          "owners and managers see everything.",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "staffId", in: "query", schema: uuid },
          { name: "customerId", in: "query", schema: uuid },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"],
            },
          },
          pageParam,
          limitParam,
        ],
        responses: {
          200: ok("Appointments", {
            $ref: "#/components/schemas/PaginatedAppointments",
          }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Appointments"],
        summary:
          "Book an appointment. Authenticated customers book for themselves; business " +
          "members may pass customerId to book on behalf of a customer.",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/CreateAppointmentRequest" }),
        },
        responses: {
          201: ok("Appointment created", { $ref: "#/components/schemas/Appointment" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/appointments/{appointmentId}": {
      parameters: [businessIdParam, appointmentIdParam],
      get: {
        tags: ["Appointments"],
        summary: "Get one appointment",
        responses: {
          200: ok("Appointment", { $ref: "#/components/schemas/Appointment" }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Appointments"],
        summary: "Update notes or move the appointment through its lifecycle",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/UpdateAppointmentRequest" }),
        },
        responses: {
          200: ok("Appointment updated", { $ref: "#/components/schemas/Appointment" }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/appointments/{appointmentId}/cancel": {
      parameters: [businessIdParam, appointmentIdParam],
      post: {
        tags: ["Appointments"],
        summary: "Cancel an appointment",
        responses: {
          200: ok("Appointment cancelled", { $ref: "#/components/schemas/Appointment" }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/appointments/{appointmentId}/reschedule": {
      parameters: [businessIdParam, appointmentIdParam],
      post: {
        tags: ["Appointments"],
        summary: "Reschedule an appointment after revalidating the schedule",
        requestBody: {
          required: true,
          ...json({ $ref: "#/components/schemas/RescheduleAppointmentRequest" }),
        },
        responses: {
          200: ok("Appointment rescheduled", {
            $ref: "#/components/schemas/Appointment",
          }),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/appointments/{appointmentId}/complete": {
      parameters: [businessIdParam, appointmentIdParam],
      post: {
        tags: ["Appointments"],
        summary: "Mark a confirmed appointment as completed",
        responses: {
          200: ok("Appointment completed", { $ref: "#/components/schemas/Appointment" }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/businesses/{id}/appointments/{appointmentId}/no-show": {
      parameters: [businessIdParam, appointmentIdParam],
      post: {
        tags: ["Appointments"],
        summary: "Mark a confirmed appointment as a no-show",
        responses: {
          200: ok("Appointment marked as no-show", {
            $ref: "#/components/schemas/Appointment",
          }),
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
  },
};
