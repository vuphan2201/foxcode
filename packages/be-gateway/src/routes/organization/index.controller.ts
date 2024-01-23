import {
  mdOrgAdd,
  mdOrgGet,
  mdOrgGetOne,
  mdOrgGetOwned,
  mdOrgMemAdd,
  mdOrgMemGetByUid,
  mdOrgUpdate
} from '@shared/models'
import {
  BaseController,
  Controller,
  Get,
  Post,
  Put,
  UseMiddleware
} from '../../core'
import { authMiddleware } from '../../middlewares'
import { AuthRequest } from '../../types'
import { CKEY, delCache, getJSONCache, setJSONCache } from '../../lib/redis'
import InternalServerException from '../../exceptions/InternalServerException'
import {
  InvitationStatus,
  Organization,
  OrganizationRole
} from '@prisma/client'
import { MAX_STORAGE_SIZE } from '../storage'

@Controller('/org')
@UseMiddleware([authMiddleware])
export class OrganizationController extends BaseController {
  @Get('/:orgId')
  async getOrgById() {
    const { orgId } = this.req.params as { orgId: string }
    const result = await mdOrgGetOne(orgId)

    return result
  }

  @Get('')
  async getOrgByUid() {
    const req = this.req as AuthRequest
    const res = this.res

    try {
      const { id } = req.authen

      const key = [CKEY.USER_ORGS, id]
      const cached = await getJSONCache(key)
      if (cached) {
        console.log('return cached org list 2')
        return cached
      }

      const orgIds = await mdOrgMemGetByUid(id)
      const orgs = await mdOrgGet(orgIds.map(org => org.organizationId))

      setJSONCache(key, orgs)

      res.setHeader('Cache-Control', 'max-age=20, public')

      return orgs
    } catch (error) {
      console.log(error)
      throw new InternalServerException()
    }
  }

  @Post('')
  async createOrganization() {
    const req = this.req as AuthRequest
    const res = this.res
    try {
      const body = req.body as Pick<Organization, 'name' | 'desc' | 'cover'>
      const { id } = req.authen
      const key = [CKEY.USER_ORGS, id]

      const ownedOrgs = await mdOrgGetOwned(id)

      if (ownedOrgs.length >= 1) {
        return res.status(500).send('REACHED_MAX_ORGANIZATION')
      }

      const result = await mdOrgAdd({
        name: body.name,
        desc: body.desc,
        maxStorageSize: MAX_STORAGE_SIZE,
        cover: body.cover,
        avatar: null,
        createdAt: new Date(),
        createdBy: id,
        updatedAt: null,
        updatedBy: null
      })

      delCache(key)

      await mdOrgMemAdd({
        uid: id,
        status: InvitationStatus.ACCEPTED,
        organizationId: result.id,
        role: OrganizationRole.ADMIN,
        createdAt: new Date(),
        createdBy: id,
        updatedAt: null,
        updatedBy: null
      })

      return result
    } catch (error) {
      console.log('create org error', error)

      throw new InternalServerException()
    }
  }

  @Put('')
  async editOrgInfo() {
    const req = this.req as AuthRequest

    try {
      const body = req.body as Pick<
        Organization,
        'name' | 'desc' | 'cover' | 'id'
      >
      const { id } = req.authen
      const key = [CKEY.USER_ORGS, id]

      const result = await mdOrgUpdate(body.id, {
        name: body.name,
        desc: body.desc,
        cover: body.cover,
        avatar: null,
        updatedAt: new Date(),
        updatedBy: id
      })

      delCache(key)

      return result
    } catch (error) {
      console.log('create org error', error)
      throw new InternalServerException()
    }
  }
}