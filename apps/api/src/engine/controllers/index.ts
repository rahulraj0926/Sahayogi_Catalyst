// Each file here is one area of the engine, moved from legacy/routes/*.ts into typed controllers (F13).
import { ApprovalsController, ApproveByLinkController, SharingController } from './approvals.controller';
import { AssistantChatController } from './assistant.controller';
import { AssistantUsageController, InboxController } from './inbox.controller';
import { PortfolioController } from './portfolio.controller';
import { PointersController } from './pointers.controller';
import { AttachmentsController } from './attachments.controller';
import { DocumentsController, DossierController } from './documents.controller';
import { ExistingController } from './existing.controller';
import { FeedbackController } from './feedback.controller';
import { MembersController } from './members.controller';
import { FlowEditController } from './flowedit.controller';
import { HelpController } from './help.controller';
import { JourneyController } from './journey.controller';
import { NeededController } from './needed.controller';
import { PeopleController } from './people.controller';
import { SearchController, SheetController } from './sheet.controller';
import { StagesController } from './stages.controller';
import { ProductBasicsController, ItemsController, ReviewController, LinksController, QuestionsController } from './lifecycle.controller';
import { CriteriaController, GatesController, WaiversController, ConditionsController, RequestsController, AgentController, TraceController, FlowsController, CompetitorViewsController, HandoffPackageController, DemoController } from './checks.controller';
import { HandoffController, StoriesController } from './stories.controller';
import { CompetitorCompareController, NextActionsController, ProductSummaryController, ReportsController, SessionsController } from './work.controller';

export const ENGINE_CONTROLLERS = [
  PeopleController, NeededController, SheetController, SearchController, ExistingController, JourneyController, StagesController,
  HelpController, FlowEditController, FeedbackController, MembersController,
  DocumentsController, DossierController, StoriesController, HandoffController,
  NextActionsController, SessionsController, ProductSummaryController, ReportsController, CompetitorCompareController,
  ProductBasicsController, ItemsController, ReviewController, LinksController, QuestionsController,
  CriteriaController, GatesController, WaiversController, ConditionsController, RequestsController, AgentController, TraceController, FlowsController, CompetitorViewsController, HandoffPackageController, DemoController,
  PortfolioController, AttachmentsController, AssistantChatController, AssistantUsageController, InboxController, PointersController, ApproveByLinkController, ApprovalsController, SharingController,
];
